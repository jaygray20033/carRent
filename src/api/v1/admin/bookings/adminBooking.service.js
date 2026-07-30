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
  assignedStaff: {
    select: { id: true, fullName: true, phone: true, email: true, role: { select: { code: true, name: true } } },
  },
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

// Roles allowed to be assigned as the handover agent for a C2C booking.
const ASSIGNABLE_ROLES = ['ADMIN', 'OPERATOR', 'AGENT'];

// Statuses that still need a handover — past these, reassignment is locked.
const ASSIGNABLE_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.PENDING_PAYMENT,
];

export const adminBookingService = {
  /**
   * UC-54 — Admin booking list. Filters:
   *   status    : exact booking status
   *   from / to : pickup_at range (inclusive; from→00:00, to→23:59:59.999)
   *   q         : booking code / customer name / phone / email (contains)
   *   assignedStaffId : filter by the staff currently assigned for handover
   *   unassigned : when true, only bookings with no assignedStaffId
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

    if (query.assignedStaffId != null) {
      where.assignedStaffId = Number(query.assignedStaffId);
    } else if (query.unassigned === true || query.unassigned === 'true') {
      where.assignedStaffId = null;
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
        assignedStaff: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            role: { select: { code: true, name: true } },
          },
        },
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
   * POST /admin/bookings/:id/assign-staff — assign an ADMIN/OPERATOR/AGENT
   * as the handover agent for a C2C booking. Notifies the assignee and
   * records a history entry. Allowed while the booking is still pending
   * payment or confirmed (pre-handover).
   */
  async assignStaff(adminId, id, staffId) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(id) } });
    if (!booking) throw new NotFoundError('Booking');

    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
      throw new AppError(
        `Không thể gán nhân viên khi đơn đang ${booking.status}`,
        409,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const staff = await prisma.user.findUnique({
      where: { id: Number(staffId) },
      select: {
        id: true,
        fullName: true,
        phone: true,
        status: true,
        role: { select: { code: true, name: true } },
      },
    });
    if (!staff) throw new NotFoundError('Staff');
    if (staff.status !== 'ACTIVE') {
      throw new AppError('Nhân viên không ở trạng thái ACTIVE', 422, 'STAFF_INACTIVE');
    }
    if (!ASSIGNABLE_ROLES.includes(staff.role?.code)) {
      throw new AppError(
        'Chỉ gán được ADMIN / OPERATOR / AGENT',
        422,
        'STAFF_ROLE_INVALID'
      );
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        assignedStaffId: staff.id,
        assignedAt: new Date(),
        history: {
          create: {
            fromStatus: booking.status,
            toStatus: booking.status,
            changedBy: adminId,
            note: `Gán nhân viên giao xe: ${staff.fullName} (#${staff.id})`,
            metadata: JSON.stringify({
              assignedStaffId: staff.id,
              assignedStaffName: staff.fullName,
            }),
          },
        },
      },
      include: listInclude,
    });

    await notificationService
      .notify({
        userId: staff.id,
        type: 'BOOKING_ASSIGNED',
        title: `Bạn được gán đơn ${booking.bookingCode}`,
        body: `Pickup ${new Date(booking.pickupAt).toLocaleString('vi-VN')} — vui lòng chuẩn bị giao xe.`,
        link: `/admin/bookings/${booking.id}`,
      })
      .catch(() => {});

    return updated;
  },

  /**
   * GET /admin/bookings/upcoming-pickups — CONFIRMED bookings whose pickupAt
   * falls within the next `hours` (default 24). Sorted soonest-first so the
   * station board shows what needs handing over next. Optional filters:
   * unassigned-only, or a specific assignedStaffId.
   */
  async upcomingPickups({ hours = 24, unassigned, assignedStaffId } = {}) {
    const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    const now = new Date();
    const until = new Date(now.getTime() + windowHours * 3600_000);

    const where = {
      status: BOOKING_STATUS.CONFIRMED,
      pickupAt: { gte: now, lte: until },
    };
    if (assignedStaffId != null) {
      where.assignedStaffId = Number(assignedStaffId);
    } else if (unassigned === true || unassigned === 'true') {
      where.assignedStaffId = null;
    }

    const items = await prisma.booking.findMany({
      where,
      orderBy: { pickupAt: 'asc' },
      take: 100,
      include: listInclude,
    });

    return {
      windowHours,
      from: now.toISOString(),
      to: until.toISOString(),
      total: items.length,
      items,
    };
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

    // Free the Redis hold + notify renter + staff (best-effort, never blocks).
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

    await notificationService
      .notifyRoles({
        roles: ['ADMIN', 'OPERATOR'],
        type: 'BOOKING_NEW',
        title: `Đơn mới ${confirmed.bookingCode}`,
        body: `Thanh toán offline đã xác nhận — pickup ${new Date(confirmed.pickupAt).toLocaleString('vi-VN')}. Cần gán nhân viên giao xe.`,
        link: `/admin/bookings/${confirmed.id}`,
      })
      .catch(() => {});

    return confirmed;
  },
};

export default adminBookingService;
