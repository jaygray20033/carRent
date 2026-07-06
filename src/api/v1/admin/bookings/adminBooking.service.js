// src/api/v1/admin/bookings/adminBooking.service.js
// Admin booking management (Day 33 — UC-54).
//   - list        : filter by status, pickup-date range, and free-text q
//                   (booking code / customer name / phone / email)
//   - addNote     : append an internal note as a history entry (timeline)
//   - confirmPayment : manually settle a BANK_TRANSFER / CASH payment and
//                   confirm the booking (PENDING_PAYMENT → CONFIRMED)
import prisma from '../../../../config/db.js';
import { NotFoundError, AppError } from '../../../../utils/apiError.js';
import { BOOKING_STATUS } from '../../../../config/constants.js';
import { notificationService } from '../../../../services/notificationService.js';
import RedisLockService from '../../../../services/RedisLockService.js';
import { randomUUID } from 'node:crypto';

const toIso = (d) => new Date(d).toISOString();

// Manual (offline) methods an admin can confirm by hand.
const MANUAL_METHODS = ['BANK_TRANSFER', 'CASH'];

const listInclude = {
  user: { select: { id: true, fullName: true, phone: true, email: true } },
  vehicle: {
    select: {
      id: true,
      name: true,
      licensePlate: true,
      thumbnailUrl: true,
      brand: { select: { id: true, name: true } },
      model: { select: { id: true, name: true } },
    },
  },
  pickupStation: { select: { id: true, name: true, city: true } },
  dropoffStation: { select: { id: true, name: true, city: true } },
};

export const adminBookingService = {
  /**
   * UC-54 — Admin booking list. Filters:
   *   status    : exact booking status
   *   from / to : pickup_at range (inclusive; from→00:00, to→23:59:59.999)
   *   q         : booking code / customer name / phone / email (contains)
   */
  async list(query) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      const pickupAt = {};
      if (query.from) {
        const start = new Date(query.from);
        start.setHours(0, 0, 0, 0);
        pickupAt.gte = start;
      }
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        pickupAt.lte = end;
      }
      where.pickupAt = pickupAt;
    }

    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { bookingCode: { contains: term } },
        { user: { fullName: { contains: term } } },
        { user: { phone: { contains: term } } },
        { user: { email: { contains: term } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: listInclude,
      }),
    ]);

    return { items, total, page, limit };
  },

  /** Full admin detail — everything the detail page needs, newest history first. */
  async getById(id) {
    const booking = await prisma.booking.findUnique({
      where: { id: Number(id) },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true } },
        vehicle: { include: { brand: true, model: true, images: true } },
        pickupStation: true,
        dropoffStation: true,
        insurancePlan: true,
        payments: { orderBy: { createdAt: 'desc' } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!booking) throw new NotFoundError('Booking');
    return booking;
  },

  /**
   * POST /admin/bookings/:id/note — record an internal note in the timeline.
   * Stored as a history row (same from/to status) tagged internalNote so the
   * FE can style it apart from status transitions.
   */
  async addNote(adminId, id, note) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(id) } });
    if (!booking) throw new NotFoundError('Booking');

    await prisma.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        changedBy: adminId,
        note,
        metadata: JSON.stringify({ internalNote: true }),
      },
    });

    return this.getById(booking.id);
  },

  /**
   * POST /admin/bookings/:id/confirm-payment — manual settlement for offline
   * methods (BANK_TRANSFER / CASH). Marks a PENDING booking payment SUCCESS
   * (or creates one if none exists) and confirms the booking. Idempotent: a
   * booking already CONFIRMED/IN_USE/COMPLETED is rejected.
   */
  async confirmPayment(adminId, id, { method = 'BANK_TRANSFER', note } = {}) {
    const booking = await prisma.booking.findUnique({
      where: { id: Number(id) },
      include: { payments: true },
    });
    if (!booking) throw new NotFoundError('Booking');

    if (booking.status !== BOOKING_STATUS.PENDING_PAYMENT) {
      throw new AppError(
        'Only PENDING_PAYMENT bookings can be confirmed manually',
        400,
        'BOOKING_NOT_PAYABLE'
      );
    }
    if (!MANUAL_METHODS.includes(method)) {
      throw new AppError(
        'Manual confirmation only supports BANK_TRANSFER or CASH',
        400,
        'METHOD_NOT_MANUAL'
      );
    }

    // Reuse an existing PENDING booking payment if present; else create one.
    const pending = booking.payments.find(
      (p) => p.type === 'BOOKING' && p.status === 'PENDING'
    );

    const confirmed = await prisma.$transaction(async (tx) => {
      if (pending) {
        await tx.payment.update({
          where: { id: pending.id },
          data: {
            method,
            status: 'SUCCESS',
            paidAt: new Date(),
            transactionId: `MANUAL-${Date.now()}`,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            userId: booking.userId,
            type: 'BOOKING',
            method,
            amount: booking.totalAmount,
            status: 'SUCCESS',
            txnRef: randomUUID(),
            transactionId: `MANUAL-${Date.now()}`,
            paidAt: new Date(),
            metadata: JSON.stringify({ purpose: 'BOOKING_PAYMENT', bookingId: booking.id }),
          },
        });
      }

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BOOKING_STATUS.CONFIRMED,
          history: {
            create: {
              fromStatus: booking.status,
              toStatus: BOOKING_STATUS.CONFIRMED,
              changedBy: adminId,
              note: note || `Payment ${method} confirmed manually`,
              metadata: JSON.stringify({ method, manual: true }),
            },
          },
        },
        include: listInclude,
      });
    });

    // Free the Redis hold + notify the renter (best-effort, never blocks).
    await RedisLockService.releaseHold(
      confirmed.vehicleId,
      toIso(confirmed.pickupAt),
      toIso(confirmed.returnAt),
      confirmed.id
    ).catch(() => {});

    await notificationService
      .notify({
        userId: confirmed.userId,
        type: 'BOOKING_CONFIRMED',
        title: 'Đặt xe thành công',
        body: `Đơn ${confirmed.bookingCode} đã được xác nhận thanh toán. Hẹn gặp bạn tại điểm nhận xe!`,
        link: `/me/bookings/${confirmed.id}`,
      })
      .catch(() => {});

    return confirmed;
  },
};

export default adminBookingService;
