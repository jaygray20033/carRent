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
  UnprocessableError,
} from '../../../utils/apiError.js';
import { generateBookingCode } from '../../../utils/bookingCode.js';
import { BOOKING_STATUS, TTL } from '../../../config/constants.js';
import RedisLockService from '../../../services/RedisLockService.js';
import { couponService } from '../coupons/coupon.service.js';
import { notificationService } from '../../../services/notificationService.js';
import logger from '../../../config/logger.js';

// Methods whose refund settles instantly against the internal wallet balance.
const WALLET_METHOD = 'WALLET';
// Methods that require an out-of-band provider refund (async job).
const EXTERNAL_METHODS = ['VNPAY', 'MOMO', 'ZALOPAY'];

/**
 * UC-20 refund schedule. Percent of the paid amount returned to the renter,
 * based on how long before pickup the cancellation happens.
 *   ≥ 48h  → 100%
 *   24–48h → 70%
 *   < 24h  → 30%
 *   after pickup → not cancelable (caller throws 422)
 * Returns null when the pickup time has already passed.
 */
export const computeRefundPercent = (pickupAt, now = new Date()) => {
  const hoursToPickup = (new Date(pickupAt).getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursToPickup < 0) return null;
  if (hoursToPickup >= 48) return 100;
  if (hoursToPickup >= 24) return 70;
  return 30;
};

/** Pick the settled BOOKING payment to refund against (most recent SUCCESS). */
export const findRefundablePayment = (payments = []) =>
  payments
    .filter((p) => p.type === 'BOOKING' && p.status === 'SUCCESS')
    .sort((a, b) => new Date(b.paidAt ?? b.createdAt) - new Date(a.paidAt ?? a.createdAt))[0] ?? null;

/** Lazily enqueue a provider refund job (degrades gracefully if Redis is down). */
async function enqueueRefundJob(data) {
  try {
    const { paymentQueue } = await import('../../../jobs/queue.js');
    await paymentQueue.add('process-refund', data);
  } catch (err) {
    logger.warn(`Failed to enqueue process-refund: ${err.message}`);
  }
}

// Statuses that still occupy the vehicle for a given period.
const ACTIVE_STATUSES = [
  BOOKING_STATUS.DRAFT,
  BOOKING_STATUS.PENDING_PAYMENT,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.IN_USE,
];

const toIso = (d) => new Date(d).toISOString();

export const calcTotalDays = (pickupAt, returnAt) => {
  const ms = new Date(returnAt) - new Date(pickupAt);
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

/**
 * Recompute the price breakdown from raw inputs.
 * Insurance is percent-based on the rental base price (InsurancePlan.ratePercent).
 */
export const computeBreakdown = ({ pricePerDay, totalDays, insurancePlan, couponDiscount = 0 }) => {
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

  /**
   * UC-20 — Cancel a booking and compute/settle the refund.
   *
   *   - Owner only (admins go through adminRefund); status ∈ {DRAFT,
   *     PENDING_PAYMENT, CONFIRMED}.
   *   - Refund % follows computeRefundPercent(); after pickup → 422
   *     BOOKING_NOT_CANCELABLE.
   *   - The Booking transition + refund bookkeeping happen in one transaction.
   *     WALLET payments are credited back inline (atomic with the cancel);
   *     external providers (VNPAY/MOMO/ZALOPAY) get a refund job enqueued and
   *     are flipped to REFUNDED by the worker once the provider confirms.
   *   - The Redis hold is released best-effort afterwards.
   */
  async cancel(userId, roleCode, id, reason) {
    const booking = await this.getById(userId, roleCode, id);
    if (booking.userId !== userId) throw new ForbiddenError('Not your booking');
    return this._cancelAndRefund(booking, {
      changedBy: userId,
      reason: reason || 'User cancelled',
      adminOverride: false,
    });
  },

  /**
   * Admin override (UC-20) — cancel + refund a booking bypassing the time
   * window. The admin chooses the refund percent (defaults to 100%).
   */
  async adminRefund(adminId, id, { reason, refundPercent = 100 } = {}) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!booking) throw new NotFoundError('Booking');
    return this._cancelAndRefund(booking, {
      changedBy: adminId,
      reason: reason || 'Admin refund',
      adminOverride: true,
      forcedPercent: refundPercent,
    });
  },

  /**
   * Day 30 — Operator/Agent starts the rental at handover.
   * CONFIRMED → IN_USE, stamps actualPickupAt and marks the vehicle RENTED.
   */
  async startRental(staffId, id) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(id) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      throw new AppError(
        'Only CONFIRMED bookings can be started',
        400,
        'BOOKING_NOT_STARTABLE'
      );
    }

    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BOOKING_STATUS.IN_USE,
          actualPickupAt: now,
          history: {
            create: {
              fromStatus: booking.status,
              toStatus: BOOKING_STATUS.IN_USE,
              changedBy: staffId,
              note: 'Rental started (vehicle handed over)',
              metadata: JSON.stringify({ actualPickupAt: now.toISOString() }),
            },
          },
        },
        include: { vehicle: { include: { brand: true, model: true } } },
      });
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'RENTED' },
      });
      return updated;
    });
  },

  /**
   * Day 30 — Operator/Agent closes out the rental on return.
   * IN_USE → COMPLETED, stamps actualReturnAt, records an optional extra fee
   * (fuel / charging / damage), frees the vehicle, and notifies the renter to
   * leave a review.
   */
  async returnRental(staffId, id, { extraFee = 0, note } = {}) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(id) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== BOOKING_STATUS.IN_USE) {
      throw new AppError(
        'Only IN_USE bookings can be returned',
        400,
        'BOOKING_NOT_RETURNABLE'
      );
    }

    const fee = Math.max(0, Math.round(Number(extraFee) || 0));
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BOOKING_STATUS.COMPLETED,
          actualReturnAt: now,
          extraFee: fee,
          ...(note !== undefined ? { note } : {}),
          history: {
            create: {
              fromStatus: booking.status,
              toStatus: BOOKING_STATUS.COMPLETED,
              changedBy: staffId,
              note: note || (fee > 0 ? `Returned with extra fee ${fee}` : 'Vehicle returned'),
              metadata: JSON.stringify({ actualReturnAt: now.toISOString(), extraFee: fee }),
            },
          },
        },
        include: { vehicle: { include: { brand: true, model: true } } },
      });
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'AVAILABLE' },
      });
      return result;
    });

    // Invite the renter to review the car (best-effort — never blocks the return).
    await notificationService.notify({
      userId: booking.userId,
      type: 'REVIEW_REQUEST',
      title: 'Đánh giá chuyến đi của bạn',
      body: `Bạn đã hoàn tất đơn ${booking.bookingCode}. Chia sẻ đánh giá để giúp người thuê khác nhé!`,
      link: `/me/reviews`,
    });

    return updated;
  },

  /**
   * Shared cancel + refund engine used by both the owner cancel and the admin
   * override. `adminOverride` skips the cancelable-status / time-window checks.
   */
  async _cancelAndRefund(booking, { changedBy, reason, adminOverride, forcedPercent }) {
    const CANCELABLE = [
      BOOKING_STATUS.DRAFT,
      BOOKING_STATUS.PENDING_PAYMENT,
      BOOKING_STATUS.CONFIRMED,
    ];
    if (!adminOverride && !CANCELABLE.includes(booking.status)) {
      throw new AppError('Cannot cancel booking in current status', 400, 'CANNOT_CANCEL');
    }
    if ([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REFUNDED].includes(booking.status)) {
      throw new AppError('Booking is already cancelled', 400, 'CANNOT_CANCEL');
    }

    // Determine the refund percent.
    let refundPercent;
    if (adminOverride) {
      refundPercent = Math.max(0, Math.min(100, Math.round(forcedPercent ?? 100)));
    } else {
      refundPercent = computeRefundPercent(booking.pickupAt);
      if (refundPercent === null) {
        throw new UnprocessableError(
          'Pickup time has passed; this booking can no longer be cancelled',
          'BOOKING_NOT_CANCELABLE'
        );
      }
    }

    // What was actually paid (drives whether there's anything to refund).
    const paidPayment = findRefundablePayment(booking.payments);
    const paidAmount = paidPayment ? paidPayment.amount : 0;
    const refundAmount = Math.round((paidAmount * refundPercent) / 100);

    // Decide how the refund is processed.
    //   - nothing paid (DRAFT / PENDING_PAYMENT, or 0%) → no refund needed
    //   - WALLET                                        → settle inline now
    //   - external provider                            → async job
    let refundStatus = 'NONE';
    let processVia = null;
    if (paidPayment && refundAmount > 0) {
      if (paidPayment.method === WALLET_METHOD) {
        processVia = 'WALLET';
        refundStatus = 'REFUNDED';
      } else if (EXTERNAL_METHODS.includes(paidPayment.method)) {
        processVia = 'PROVIDER';
        refundStatus = 'PENDING';
      } else {
        // CASH / BANK_TRANSFER → manual back-office refund.
        processVia = 'MANUAL';
        refundStatus = 'PENDING';
      }
    }

    const finalStatus =
      refundStatus === 'REFUNDED' ? BOOKING_STATUS.REFUNDED : BOOKING_STATUS.CANCELLED;

    const updated = await prisma.$transaction(async (tx) => {
      // Inline wallet refund: credit the balance + ledger row atomically.
      if (processVia === 'WALLET') {
        let wallet = await tx.wallet.findUnique({ where: { userId: booking.userId } });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: { userId: booking.userId, balance: 0, currency: 'VND' },
          });
        }
        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + refundAmount;

        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId: booking.userId,
            type: 'REFUND',
            amount: refundAmount,
            balanceBefore,
            balanceAfter,
            status: 'SUCCESS',
            referenceType: 'BOOKING',
            referenceId: booking.id,
            description: `Hoàn ${refundPercent}% đơn ${booking.bookingCode}`,
          },
        });
        await tx.payment.update({
          where: { id: paidPayment.id },
          data: { status: 'REFUNDED' },
        });
      }

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: finalStatus,
          cancelReason: reason,
          cancelledAt: new Date(),
          refundAmount,
          refundPercent,
          refundStatus,
          history: {
            create: {
              fromStatus: booking.status,
              toStatus: finalStatus,
              changedBy,
              note: adminOverride
                ? `Admin refund ${refundPercent}% (${refundAmount})`
                : `Cancelled — refund ${refundPercent}% (${refundAmount})`,
              metadata: JSON.stringify({
                refundPercent,
                refundAmount,
                refundStatus,
                processVia,
                paymentId: paidPayment?.id ?? null,
                adminOverride,
              }),
            },
          },
        },
      });
    });

    // Release the Redis hold (best-effort).
    await RedisLockService.releaseHold(
      booking.vehicleId,
      toIso(booking.pickupAt),
      toIso(booking.returnAt),
      booking.id
    ).catch(() => {});

    // External provider refund runs async; the worker flips REFUNDED on success.
    if (processVia === 'PROVIDER') {
      await enqueueRefundJob({
        bookingId: booking.id,
        paymentId: paidPayment.id,
        method: paidPayment.method,
        amount: refundAmount,
        txnRef: paidPayment.txnRef,
        transactionId: paidPayment.transactionId,
      });
    }

    // In-app notification for the renter (best-effort — never blocks the cancel).
    const refunded = refundStatus === 'REFUNDED';
    await notificationService.notify({
      userId: booking.userId,
      type: refunded ? 'BOOKING_REFUNDED' : 'BOOKING_CANCELLED',
      title: refunded ? 'Đơn đã được hoàn tiền' : 'Đơn đã được huỷ',
      body: refunded
        ? `Đơn ${booking.bookingCode} đã huỷ và hoàn ${refundAmount.toLocaleString('vi-VN')}đ vào ví của bạn.`
        : `Đơn ${booking.bookingCode} đã được huỷ.${refundAmount > 0 ? ` Hoàn ${refundPercent}% đang được xử lý.` : ''}`,
      link: `/me/bookings/${booking.id}`,
    });

    return updated;
  },

  /**
   * Finalise an external-provider refund (called by the payment worker after
   * the provider's refund API confirms success). Idempotent: a booking already
   * REFUNDED is a no-op. Flips Payment + Booking to REFUNDED.
   */
  async settleExternalRefund(bookingId, paymentId, transactionId = null) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.refundStatus === 'REFUNDED') return booking; // idempotent

    return prisma.$transaction(async (tx) => {
      if (paymentId) {
        await tx.payment.update({
          where: { id: Number(paymentId) },
          data: { status: 'REFUNDED', ...(transactionId ? { transactionId } : {}) },
        });
      }
      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BOOKING_STATUS.REFUNDED,
          refundStatus: 'REFUNDED',
          history: {
            create: {
              fromStatus: booking.status,
              toStatus: BOOKING_STATUS.REFUNDED,
              note: `Provider refund completed (${booking.refundAmount})`,
              metadata: JSON.stringify({ paymentId, transactionId }),
            },
          },
        },
      });
    });
  },
};

export default bookingService;
