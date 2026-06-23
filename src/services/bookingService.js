// ─────────────────────────────────────────────────────────────────────
//  src/services/bookingService.js — Booking business logic (UC-14)
// ─────────────────────────────────────────────────────────────────────
import prisma from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { generateBookingCode } from '../utils/bookingCode.js';
import { acquireLock, releaseLock } from '../utils/redisLock.js';
import pricingService from '../services/pricingService.js';
import dayjs from 'dayjs';

const HOLD_MINUTES = 15;

/**
 * Check if a vehicle has overlapping confirmed bookings in the given date range.
 * Overlaps with DRAFT/CANCELLED bookings are ignored.
 *
 * @param {number} vehicleId
 * @param {Date} pickupAt
 * @param {Date} returnAt
 * @param {number|null} excludeBookingId - Exclude this booking from check (for edits)
 * @returns {Promise<boolean>} true if overlap exists
 */
export async function hasOverlap(vehicleId, pickupAt, returnAt, excludeBookingId = null) {
  const excludeStatuses = ['CANCELLED', 'EXPIRED'];

  const where = {
    vehicleId,
    status: { notIn: excludeStatuses },
    // Overlap condition: existing.pickup_at < new.return_at AND existing.return_at > new.pickup_at
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
 * Check if user already has an active DRAFT for the same vehicle (§UC-14 rule).
 *
 * @param {number} userId
 * @param {number} vehicleId
 * @returns {Promise<object|null>} existing draft booking or null
 */
export async function findExistingDraft(userId, vehicleId) {
  return prisma.booking.findFirst({
    where: {
      userId,
      vehicleId,
      status: 'DRAFT',
      holdUntil: { gt: new Date() }, // still valid (not expired)
    },
  });
}

/**
 * Create a draft booking (UC-14).
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {number} params.vehicleId
 * @param {string} params.pickupAt
 * @param {string} params.returnAt
 * @param {string} params.pickupPoint
 * @param {string} params.dropoffPoint
 * @param {string} params.rentalType
 * @param {boolean} params.premiumInsurance
 * @returns {Promise<object>}
 */
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
  if (!vehicle) {
    throw new AppError(404, 'Vehicle not found');
  }
  if (vehicle.status !== 'AVAILABLE') {
    throw new AppError(400, 'Vehicle is not available for booking');
  }

  // 2. Rule: 1 user chỉ có 1 DRAFT chưa thanh toán cho cùng vehicle
  const existingDraft = await findExistingDraft(userId, vehicleId);
  if (existingDraft) {
    throw new AppError(409, 'You already have an active draft booking for this vehicle', {
      bookingId: existingDraft.id,
      bookingCode: existingDraft.bookingCode,
    });
  }

  // 3. Check overlap (Day 10 logic)
  const pickup = new Date(pickupAt);
  const returnDate = new Date(returnAt);
  const overlap = await hasOverlap(vehicleId, pickup, returnDate);
  if (overlap) {
    throw new AppError(409, 'Vehicle is already booked for the selected dates');
  }

  // 4. Acquire Redis lock: lock:car:{vehicleId} SETNX TTL 15 min
  const lockKey = `lock:car:${vehicleId}`;
  const locked = await acquireLock(lockKey, HOLD_MINUTES * 60);
  if (!locked) {
    throw new AppError(
      423,
      'Vehicle is currently being held by another user. Please try again later.'
    );
  }

  try {
    // 5. Calculate pricing via pricingService
    const days = pricingService.calculateDays(pickupAt, returnAt);
    const withDriver = rentalType === 'WITH_DRIVER';

    const pricing = pricingService.calculate({
      dailyRate: vehicle.pricePerDay,
      days,
      withDriver,
      premiumInsurance: premiumInsurance || false,
      pickupPoint,
      dropoffPoint,
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
    // Release lock on failure
    await releaseLock(lockKey);
    throw error;
  }
}

export default { createDraft, hasOverlap, findExistingDraft };
