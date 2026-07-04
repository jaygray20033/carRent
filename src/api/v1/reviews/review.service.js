// src/api/v1/reviews/review.service.js
// UC-50 — Review a vehicle after a completed rental.
//   create  — one review per COMPLETED booking owned by the user
//   listByVehicle — public list of APPROVED reviews + pagination
//   listMine — the user's own reviews (any status)
//   reviewableBookings — COMPLETED bookings without a review yet
// Recomputes vehicle.rating + vehicle.reviewCount from APPROVED reviews.
import prisma from '../../../config/db.js';
import { NotFoundError, ForbiddenError, ConflictError, AppError } from '../../../utils/apiError.js';
import { BOOKING_STATUS } from '../../../config/constants.js';

const parsePhotos = (json) => {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const shape = (r) => ({ ...r, photos: parsePhotos(r.photos) });

/**
 * Recompute vehicle.rating (avg) + vehicle.reviewCount from APPROVED reviews.
 * Called after a review is created (auto-approved for now) so /cars reflects
 * real ratings without a separate view.
 */
async function recomputeVehicleRating(tx, vehicleId) {
  const agg = await tx.review.aggregate({
    where: { vehicleId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count?._all ?? 0;
  const avg = count > 0 ? Number((agg._avg.rating ?? 0).toFixed(1)) : 0;
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { rating: avg, reviewCount: count },
  });
  return { avg, count };
}

export const reviewService = {
  /**
   * UC-50 — Create a review for a COMPLETED booking. Only the booking owner,
   * only once per booking. Reviews are auto-approved (no moderation queue for
   * UC-50) so the rating aggregate updates immediately.
   */
  async create(userId, bookingId, { rating, content, photos }) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== BOOKING_STATUS.COMPLETED)
      throw new AppError('Only completed bookings can be reviewed', 400, 'BOOKING_NOT_COMPLETED');

    const existing = await prisma.review.findUnique({ where: { bookingId } });
    if (existing) throw new ConflictError('This booking has already been reviewed', 'ALREADY_REVIEWED');

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          userId,
          vehicleId: booking.vehicleId,
          bookingId,
          rating,
          content: content ?? null,
          photos: photos && photos.length ? JSON.stringify(photos) : null,
          status: 'APPROVED',
        },
      });
      await recomputeVehicleRating(tx, booking.vehicleId);
      return created;
    });

    return shape(review);
  },

  /** GET /cars/:id/reviews — public list of APPROVED reviews for a vehicle. */
  async listByVehicle(vehicleId, { page = 1, limit = 10 }) {
    const id = Number(vehicleId);
    const where = { vehicleId: id, status: 'APPROVED' };
    const skip = (page - 1) * limit;

    const [total, rows, agg] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    // Attach reviewer identity (name + avatar) without a Prisma relation on Review.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = rows.map((r) => ({
      ...shape(r),
      user: userMap.get(r.userId) ?? null,
    }));

    return {
      items,
      total,
      page,
      limit,
      ratingAvg: total > 0 ? Number((agg._avg.rating ?? 0).toFixed(1)) : 0,
    };
  },

  /** GET /me/reviews — the user's own reviews (any status), newest first. */
  async listMine(userId, { page = 1, limit = 10 }) {
    const where = { userId };
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const bookingIds = rows.map((r) => r.bookingId).filter(Boolean);
    const bookings = bookingIds.length
      ? await prisma.booking.findMany({
          where: { id: { in: bookingIds } },
          select: {
            id: true,
            bookingCode: true,
            vehicle: { select: { id: true, name: true, thumbnailUrl: true, modelYear: true } },
          },
        })
      : [];
    const bookingMap = new Map(bookings.map((b) => [b.id, b]));

    const items = rows.map((r) => ({
      ...shape(r),
      booking: r.bookingId ? bookingMap.get(r.bookingId) ?? null : null,
    }));

    return { items, total, page, limit };
  },

  /**
   * GET /me/reviews/reviewable — COMPLETED bookings the user hasn't reviewed
   * yet, so the FE can show a "write a review" CTA.
   */
  async reviewableBookings(userId) {
    const reviewed = await prisma.review.findMany({
      where: { userId, bookingId: { not: null } },
      select: { bookingId: true },
    });
    const reviewedIds = reviewed.map((r) => r.bookingId);

    return prisma.booking.findMany({
      where: {
        userId,
        status: BOOKING_STATUS.COMPLETED,
        id: { notIn: reviewedIds.length ? reviewedIds : [0] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        bookingCode: true,
        pickupAt: true,
        returnAt: true,
        vehicle: { select: { id: true, name: true, slug: true, thumbnailUrl: true, modelYear: true } },
      },
    });
  },
};

export default reviewService;
