// ─────────────────────────────────────────────────────────────────────
//  src/services/bookingService.js — Booking business logic
//  Day 11: createDraft (UC-14)
//  Day 12: updateDraft (UC-15) — insurance, dropoff, recompute pricing
// ─────────────────────────────────────────────────────────────────────
import prisma from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { generateBookingCode } from '../utils/bookingCode.js';
import { acquireLock, releaseLock } from '../utils/redisLock.js';
import pricingService from '../services/pricingService.js';
import dayjs from 'dayjs';

const HOLD_MINUTES = 15;

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Check if a vehicle has overlapping confirmed bookings in the given date range.
 */
export async function hasOverlap(vehicleId, pickupAt, returnAt, excludeBookingId = null) {
  const excludeStatuses = ['CANCELLED', 'EXPIRED'];
  const where = {
    vehicleId,
    status: { notIn: excludeStatuses },
    pickupAt: { lt: returnAt },
    returnAt: { gt: pickupAt },
  };
  if (excludeBookingId) {
    where.id = { not: excludeBookingId };
  }
  const count = await prisma.booking.count({ where });
  return count > 0;
}

/**
 * Check if user already has an active DRAFT for the same vehicle.
 */
export async function findExistingDraft(userId, vehicleId) {
  return prisma.booking.findFirst({
    where: {
      userId,
      vehicleId,
      status: 'DRAFT',
      holdUntil: { gt: new Date() },
    },
  });
}

// ─── createDraft (UC-14 — Day 11) ───────────────────────────────────

export async function createDraft({
  userId,
  vehicleId,
  pickupAt,
  returnAt,
  pickupPoint,
  dropoffPoint,
  rentalType,
  premiumInsurance,
}) {
  // 1. Check vehicle exists & is available
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw new AppError(404, 'Vehicle not found');
  if (vehicle.status !== 'AVAILABLE')
    throw new AppError(400, 'Vehicle is not available for booking');

  // 2. 1 user chỉ có 1 DRAFT chưa thanh toán cho cùng vehicle
  const existingDraft = await findExistingDraft(userId, vehicleId);
  if (existingDraft) {
    throw new AppError(409, 'You already have an active draft booking for this vehicle', {
      bookingId: existingDraft.id,
      bookingCode: existingDraft.bookingCode,
    });
  }

  // 3. Overlap check
  const pickup = new Date(pickupAt);
  const returnDate = new Date(returnAt);
  const overlap = await hasOverlap(vehicleId, pickup, returnDate);
  if (overlap) throw new AppError(409, 'Vehicle is already booked for the selected dates');

  // 4. Acquire Redis lock
  const lockKey = `lock:car:${vehicleId}`;
  const locked = await acquireLock(lockKey, HOLD_MINUTES * 60);
  if (!locked)
    throw new AppError(
      423,
      'Vehicle is currently being held by another user. Please try again later.'
    );

  try {
    // 5. Calculate pricing
    const days = pricingService.calculateDays(pickupAt, returnAt);
    const withDriver = rentalType === 'WITH_DRIVER';

    const pricing = pricingService.calculate({
      dailyRate: vehicle.pricePerDay,
      days,
      withDriver,
      insuranceRatePercent: 0, // no insurance selected yet in draft
      pickupPoint,
      dropoffPoint,
      couponDiscount: 0,
      depositAmount: vehicle.depositAmount || 5000000,
    });

    // 6. Insert Booking status=DRAFT, hold_until=now+15m
    const holdUntil = dayjs().add(HOLD_MINUTES, 'minute').toDate();
    const bookingCode = generateBookingCode();

    const booking = await prisma.booking.create({
      data: {
        bookingCode,
        userId,
        vehicleId,
        rentalType,
        pickupAt: pickup,
        returnAt: returnDate,
        pickupPoint,
        dropoffPoint,
        totalDays: days,
        pricePerDay: vehicle.pricePerDay,
        subtotal: pricing.subtotal,
        insuranceFee: 0,
        couponDiscount: 0,
        totalAmount: pricing.total,
        status: 'DRAFT',
        holdUntil,
        pricingSnapshot: JSON.stringify(pricing),
      },
    });

    // 7. Insert BookingHistory (DRAFT)
    await prisma.bookingHistory.create({
      data: {
        bookingId: booking.id,
        status: 'DRAFT',
        note: 'Booking draft created. Hold expires in 15 minutes.',
      },
    });

    return {
      bookingId: booking.id,
      code: booking.bookingCode,
      hold_until: holdUntil.toISOString(),
      pricing_preview: pricing,
    };
  } catch (error) {
    await releaseLock(lockKey);
    throw error;
  }
}

// ─── updateDraft (UC-15 — Day 12) ──────────────────────────────────
// PATCH /bookings/:id — chỉ DRAFT của chính user
// Cho phép cập nhật: insurance_plan_id, dropoff_point, recompute pricing

export async function updateDraft(userId, bookingId, payload) {
  // 1. Find booking — must be DRAFT & belong to this user
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { vehicle: true },
  });
  if (!booking) throw new AppError(404, 'Booking not found');
  if (booking.userId !== userId) throw new AppError(403, 'Not your booking');
  if (booking.status !== 'DRAFT') throw new AppError(400, 'Only DRAFT bookings can be updated');

  // 2. Check holdUntil not expired
  if (booking.holdUntil && new Date(booking.holdUntil) < new Date()) {
    throw new AppError(410, 'Booking hold has expired. Please create a new draft.');
  }

  // 3. Resolve insurance plan
  let insuranceRatePercent = 0;
  let insurancePlanId = booking.insurancePlanId;

  if (payload.insurancePlanId !== undefined) {
    if (payload.insurancePlanId === null) {
      // Remove insurance
      insurancePlanId = null;
      insuranceRatePercent = 0;
    } else {
      const plan = await prisma.insurancePlan.findUnique({
        where: { id: payload.insurancePlanId },
      });
      if (!plan || !plan.isActive) throw new AppError(404, 'Insurance plan not found or inactive');
      insurancePlanId = plan.id;
      insuranceRatePercent = plan.ratePercent;
    }
  } else if (insurancePlanId) {
    // Keep existing plan — fetch its rate
    const existingPlan = await prisma.insurancePlan.findUnique({ where: { id: insurancePlanId } });
    insuranceRatePercent = existingPlan?.ratePercent || 0;
  }

  // 4. Resolve dropoff point
  const dropoffPoint =
    payload.dropoffPoint !== undefined ? payload.dropoffPoint : booking.dropoffPoint;

  // 5. Recompute pricing
  const vehicle = booking.vehicle;
  const days = booking.totalDays;
  const withDriver = booking.rentalType === 'WITH_DRIVER';

  const pricing = pricingService.calculate({
    dailyRate: vehicle.pricePerDay,
    days,
    withDriver,
    insuranceRatePercent,
    pickupPoint: booking.pickupPoint || '',
    dropoffPoint: dropoffPoint || '',
    couponDiscount: booking.couponDiscount || 0, // keep existing coupon discount
    depositAmount: vehicle.depositAmount || 5000000,
  });

  // 6. Update booking
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      insurancePlanId,
      dropoffPoint,
      subtotal: pricing.subtotal,
      insuranceFee: pricing.insurance_fee,
      totalAmount: pricing.total,
      pricingSnapshot: JSON.stringify(pricing),
    },
    include: {
      vehicle: { include: { brand: true, model: true } },
      insurancePlan: true,
    },
  });

  return {
    bookingId: updated.id,
    code: updated.bookingCode,
    status: updated.status,
    hold_until: updated.holdUntil?.toISOString(),
    insurance_plan: updated.insurancePlan
      ? {
          id: updated.insurancePlan.id,
          code: updated.insurancePlan.code,
          name: updated.insurancePlan.name,
        }
      : null,
    pricing_preview: pricing,
  };
}

export default { createDraft, updateDraft, hasOverlap, findExistingDraft };
