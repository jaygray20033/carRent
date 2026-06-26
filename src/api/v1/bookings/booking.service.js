// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.service.js — Prisma booking service
//  Full DRAFT + Redis-hold flow (UC-14/15/16):
//    createDraft → updateDraft → confirm (DRAFT → PENDING_PAYMENT)
// ─────────────────────────────────────────────────────────────────────
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  AppError,
} from '../../../utils/apiError.js';
import { generateBookingCode } from '../../../utils/bookingCode.js';
import { BOOKING_STATUS, TTL } from '../../../config/constants.js';
import RedisLockService from '../../../services/RedisLockService.js';
import { couponService } from '../coupons/coupon.service.js';

// Statuses that still occupy the vehicle for a given period.
const ACTIVE_STATUSES = [
  BOOKING_STATUS.DRAFT,
  BOOKING_STATUS.PENDING_PAYMENT,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.IN_USE,
];

const toIso = (d) => new Date(d).toISOString();

const calcTotalDays = (pickupAt, returnAt) => {
  const ms = new Date(returnAt) - new Date(pickupAt);
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

/**
 * Recompute the price breakdown from raw inputs.
 * Insurance is percent-based on the rental base price (InsurancePlan.ratePercent).
 */
const computeBreakdown = ({ pricePerDay, totalDays, insurancePlan, couponDiscount = 0 }) => {
  const perDay = Number(pricePerDay);
  const basePrice = perDay * totalDays;
  const ratePercent = insurancePlan ? Number(insurancePlan.ratePercent) : 0;
  const insuranceFee = Math.round((basePrice * ratePercent) / 100);
  const subtotal = basePrice + insuranceFee;
  const discount = Math.min(couponDiscount, subtotal);
  const totalAmount = subtotal - discount;
  return {
    pricePerDay: perDay,
    totalDays,
    basePrice,
    insuranceRatePercent: ratePercent,
    insuranceFee,
    subtotal,
    couponDiscount: discount,
    totalAmount,
  };
};

/** Verify no overlapping active booking exists for this vehicle/period. */
const assertNoOverlap = async (vehicleId, pickupAt, returnAt, excludeBookingId = null) => {
  const overlap = await prisma.booking.findFirst({
    where: {
      vehicleId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      AND: [{ pickupAt: { lt: new Date(returnAt) } }, { returnAt: { gt: new Date(pickupAt) } }],
    },
  });
  if (overlap) throw new ConflictError('Vehicle is booked for that period', 'BOOKING_OVERLAP');
};

export const bookingService = {
  /**
   * UC-14 — Create a DRAFT booking with a 15-min Redis hold.
   */
  async createDraft({
    userId,
    vehicleId,
    pickupAt,
    returnAt,
    pickupPoint,
    dropoffPoint,
    rentalType = 'SELF_DRIVE',
    premiumInsurance = false,
  }) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle');
    if (vehicle.status !== 'AVAILABLE')
      throw new ConflictError('Vehicle is not available', 'CAR_NOT_AVAILABLE');

    await assertNoOverlap(vehicleId, pickupAt, returnAt);

    // Reject early if another draft is already holding this slot.
    const existingHolder = await RedisLockService.checkHold(
      vehicleId,
      toIso(pickupAt),
      toIso(returnAt)
    );
    if (existingHolder) throw new ConflictError('Vehicle is on hold by another user', 'CAR_HELD');

    const totalDays = calcTotalDays(pickupAt, returnAt);

    // Premium insurance maps to the active PREMIUM plan (percent-based).
    let insurancePlan = null;
    if (premiumInsurance) {
      insurancePlan = await prisma.insurancePlan.findFirst({
        where: { code: 'PREMIUM', isActive: true },
      });
    }

    const breakdown = computeBreakdown({
      pricePerDay: vehicle.pricePerDay,
      totalDays,
      insurancePlan,
    });

    const holdUntil = new Date(Date.now() + TTL.DRAFT * 1000);

    const booking = await prisma.booking.create({
      data: {
        bookingCode: generateBookingCode(),
        userId,
        vehicleId,
        pickupStationId: vehicle.stationId ?? null,
        dropoffStationId: vehicle.stationId ?? null,
        insurancePlanId: insurancePlan?.id ?? null,
        rentalType,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
        pickupPoint,
        dropoffPoint,
        totalDays,
        pricePerDay: breakdown.pricePerDay,
        subtotal: breakdown.subtotal,
        insuranceFee: breakdown.insuranceFee,
        couponDiscount: 0,
        totalAmount: breakdown.totalAmount,
        status: BOOKING_STATUS.DRAFT,
        holdUntil,
        pricingSnapshot: JSON.stringify(breakdown),
        history: {
          create: { toStatus: BOOKING_STATUS.DRAFT, changedBy: userId, note: 'Draft created' },
        },
      },
      include: { vehicle: { include: { brand: true, model: true } }, insurancePlan: true },
    });

    // Acquire the hold under the freshly-created booking id.
    const acquired = await RedisLockService.acquireHold(
      vehicleId,
      toIso(pickupAt),
      toIso(returnAt),
      booking.id,
      TTL.DRAFT
    );
    if (!acquired) {
      // Lost a race — roll back the draft we just created.
      await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
      throw new ConflictError('Vehicle is on hold by another user', 'CAR_HELD');
    }

    return { ...booking, holdTtl: TTL.DRAFT };
  },

  /**
   * UC-15 — Update a DRAFT booking (insurance plan and/or dropoff point) and
   * recompute the price. Only the owner may update, only while DRAFT.
   */
  async updateDraft(userId, bookingId, { insurancePlanId, dropoffPoint }) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== BOOKING_STATUS.DRAFT)
      throw new AppError('Only DRAFT bookings can be updated', 400, 'NOT_DRAFT');

    let insurancePlan = null;
    let nextInsurancePlanId = booking.insurancePlanId;
    if (insurancePlanId !== undefined) {
      if (insurancePlanId === null) {
        nextInsurancePlanId = null;
      } else {
        insurancePlan = await prisma.insurancePlan.findFirst({
          where: { id: insurancePlanId, isActive: true },
        });
        if (!insurancePlan) throw new NotFoundError('Insurance plan');
        nextInsurancePlanId = insurancePlan.id;
      }
    } else if (booking.insurancePlanId) {
      insurancePlan = await prisma.insurancePlan.findUnique({
        where: { id: booking.insurancePlanId },
      });
    }

    // Re-apply existing coupon discount on top of the recomputed subtotal.
    const breakdown = computeBreakdown({
      pricePerDay: booking.pricePerDay,
      totalDays: booking.totalDays,
      insurancePlan,
      couponDiscount: booking.couponDiscount,
    });

    await RedisLockService.extendHold(
      booking.vehicleId,
      toIso(booking.pickupAt),
      toIso(booking.returnAt),
      booking.id,
      TTL.DRAFT
    );
    const holdUntil = new Date(Date.now() + TTL.DRAFT * 1000);

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        insurancePlanId: nextInsurancePlanId,
        ...(dropoffPoint !== undefined ? { dropoffPoint } : {}),
        insuranceFee: breakdown.insuranceFee,
        subtotal: breakdown.subtotal,
        couponDiscount: breakdown.couponDiscount,
        totalAmount: breakdown.totalAmount,
        holdUntil,
        pricingSnapshot: JSON.stringify(breakdown),
        history: {
          create: {
            fromStatus: BOOKING_STATUS.DRAFT,
            toStatus: BOOKING_STATUS.DRAFT,
            changedBy: userId,
            note: 'Draft updated',
          },
        },
      },
      include: { vehicle: { include: { brand: true, model: true } }, insurancePlan: true },
    });

    return { ...updated, holdTtl: TTL.DRAFT };
  },

  /**
   * UC-16 — Confirm a DRAFT: optionally apply a coupon, recompute the final
   * price, transition to PENDING_PAYMENT and extend the hold.
   */
  async confirm(userId, bookingId, { couponCode } = {}) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== BOOKING_STATUS.DRAFT)
      throw new AppError('Only DRAFT bookings can be confirmed', 400, 'NOT_DRAFT');

    const insurancePlan = booking.insurancePlanId
      ? await prisma.insurancePlan.findUnique({ where: { id: booking.insurancePlanId } })
      : null;

    let couponResult = null;
    if (couponCode) {
      couponResult = await couponService.validate(couponCode, bookingId, userId);
    }

    const breakdown = computeBreakdown({
      pricePerDay: booking.pricePerDay,
      totalDays: booking.totalDays,
      insurancePlan,
      couponDiscount: couponResult?.discount ?? 0,
    });

    const holdUntil = new Date(Date.now() + TTL.PAYMENT * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      if (couponResult) {
        await tx.couponUsage.create({
          data: {
            couponId: couponResult.coupon.id,
            userId,
            bookingId,
            discount: breakdown.couponDiscount,
          },
        });
      }
      return tx.booking.update({
        where: { id: booking.id },
        data: {
          couponId: couponResult?.coupon.id ?? null,
          insuranceFee: breakdown.insuranceFee,
          subtotal: breakdown.subtotal,
          couponDiscount: breakdown.couponDiscount,
          totalAmount: breakdown.totalAmount,
          status: BOOKING_STATUS.PENDING_PAYMENT,
          holdUntil,
          pricingSnapshot: JSON.stringify(breakdown),
          history: {
            create: {
              fromStatus: BOOKING_STATUS.DRAFT,
              toStatus: BOOKING_STATUS.PENDING_PAYMENT,
              changedBy: userId,
              note: couponCode ? `Confirmed with coupon ${couponCode}` : 'Confirmed',
            },
          },
        },
        include: { vehicle: { include: { brand: true, model: true } }, insurancePlan: true },
      });
    });

    await RedisLockService.extendHold(
      booking.vehicleId,
      toIso(booking.pickupAt),
      toIso(booking.returnAt),
      booking.id,
      TTL.PAYMENT
    );

    return { ...updated, holdTtl: TTL.PAYMENT };
  },

  async listByUser(userId, { page = 1, limit = 12, status }) {
    const where = { userId };
    if (status) where.status = status;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vehicle: { include: { brand: true, model: true } },
          pickupStation: true,
          dropoffStation: true,
        },
      }),
    ]);
    return { items, total, page, limit };
  },

  async getById(userId, roleCode, id) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        vehicle: { include: { brand: true, model: true, images: true } },
        pickupStation: true,
        dropoffStation: true,
        insurancePlan: true,
        payments: true,
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!booking) throw new NotFoundError('Booking');

    if (roleCode !== 'ADMIN' && roleCode !== 'OPERATOR' && booking.userId !== userId) {
      throw new ForbiddenError('Not your booking');
    }

    // Live hold TTL for DRAFT / PENDING_PAYMENT.
    let holdTtl = null;
    if ([BOOKING_STATUS.DRAFT, BOOKING_STATUS.PENDING_PAYMENT].includes(booking.status)) {
      holdTtl = await RedisLockService.getHoldTTL(
        booking.vehicleId,
        toIso(booking.pickupAt),
        toIso(booking.returnAt)
      );
    }
    return { ...booking, holdTtl };
  },

  async cancel(userId, roleCode, id, reason) {
    const booking = await this.getById(userId, roleCode, id);
    if (
      ![BOOKING_STATUS.DRAFT, BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.CONFIRMED].includes(
        booking.status
      )
    )
      throw new AppError('Cannot cancel booking in current status', 400, 'CANNOT_CANCEL');

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BOOKING_STATUS.CANCELLED,
        cancelReason: reason || 'User cancelled',
        history: {
          create: {
            fromStatus: booking.status,
            toStatus: BOOKING_STATUS.CANCELLED,
            changedBy: userId,
            note: reason || 'User cancelled',
          },
        },
      },
    });

    await RedisLockService.releaseHold(
      booking.vehicleId,
      toIso(booking.pickupAt),
      toIso(booking.returnAt),
      booking.id
    ).catch(() => {});

    return updated;
  },
};

export default bookingService;
