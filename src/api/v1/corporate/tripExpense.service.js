// src/api/v1/corporate/tripExpense.service.js
// B2B Day 4 — UC-66/67/68 expenses + completion confirmations.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';
import { notificationService } from '../../../services/notificationService.js';
import { TRIP_EXPENSE_TYPES } from '../../../constants/corporatePricing.js';

const OPEN_FOR_EXPENSE = new Set(['IN_PROGRESS', 'PENDING_CONFIRM']);
const LOCKED = new Set(['CONFIRMED', 'SETTLED', 'CANCELLED']);

async function loadBookingForMember(membership, bookingId) {
  const booking = await prisma.corporateBooking.findUnique({
    where: { id: Number(bookingId) },
    include: {
      expenses: true,
      employee: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!booking) throw new NotFoundError('Corporate booking');
  if (booking.corporateId !== membership.corporateId) {
    throw new ForbiddenError('Không thuộc công ty của bạn');
  }
  if (!membership.isAdmin && booking.employeeId !== membership.id) {
    throw new ForbiddenError('Bạn chỉ thao tác trên chuyến của mình');
  }
  return booking;
}

async function notifyCorporateAdmins(corporateId, payload) {
  const admins = await prisma.corporateEmployee.findMany({
    where: { corporateId, isAdmin: true, isActive: true, userId: { not: null } },
    select: { userId: true },
  });
  await Promise.all(
    admins.map((a) => notificationService.notify({ userId: a.userId, ...payload }))
  );
}

export const tripExpenseService = {
  async addExpense(membership, bookingId, data) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (LOCKED.has(booking.status)) {
      throw new ConflictError('Chuyến đã khoá, không thêm chi phí', 'BOOKING_LOCKED');
    }
    if (!OPEN_FOR_EXPENSE.has(booking.status)) {
      throw new ConflictError(
        `Chỉ thêm chi phí khi IN_PROGRESS/PENDING_CONFIRM (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (!TRIP_EXPENSE_TYPES.includes(data.type)) {
      throw new UnprocessableError('Loại chi phí không hợp lệ', 'INVALID_EXPENSE_TYPE');
    }
    const amount = Math.round(Number(data.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new UnprocessableError('Số tiền phải > 0', 'INVALID_AMOUNT');
    }

    const recordedBy = membership.isAdmin ? 'employee' : 'employee';
    return prisma.tripExpense.create({
      data: {
        corporateBookingId: booking.id,
        type: data.type,
        amount,
        description: data.description || null,
        receiptUrl: data.receiptUrl || null,
        recordedBy: data.recordedBy === 'driver' ? 'driver' : recordedBy,
        approvedByAdmin: null, // pending review
      },
    });
  },

  async listExpenses(membership, bookingId) {
    const booking = await loadBookingForMember(membership, bookingId);
    const expenses = booking.expenses || [];
    const summary = buildCostSummary({
      basePrice: booking.basePrice,
      expenses,
    });
    return { expenses, summary };
  },

  async deleteExpense(membership, bookingId, expenseId) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (LOCKED.has(booking.status)) {
      throw new ConflictError('Chuyến đã khoá', 'BOOKING_LOCKED');
    }
    const expense = await prisma.tripExpense.findFirst({
      where: { id: Number(expenseId), corporateBookingId: booking.id },
    });
    if (!expense) throw new NotFoundError('Expense');

    // Only creator path: non-admin can only delete own trip's expenses that are not yet approved.
    // Cross-employee blocked by loadBookingForMember (non-admin only sees own booking).
    if (expense.approvedByAdmin === true) {
      throw new ConflictError('Không xoá được chi phí đã duyệt', 'EXPENSE_ALREADY_APPROVED');
    }

    await prisma.tripExpense.delete({ where: { id: expense.id } });
    return { id: expense.id, deleted: true };
  },

  async approveExpense(membership, bookingId, expenseId, { approved }) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Corporate Admin duyệt chi phí');
    }
    const booking = await loadBookingForMember(membership, bookingId);
    if (LOCKED.has(booking.status)) {
      throw new ConflictError('Chuyến đã khoá', 'BOOKING_LOCKED');
    }
    const expense = await prisma.tripExpense.findFirst({
      where: { id: Number(expenseId), corporateBookingId: booking.id },
    });
    if (!expense) throw new NotFoundError('Expense');

    return prisma.tripExpense.update({
      where: { id: expense.id },
      data: { approvedByAdmin: Boolean(approved) },
    });
  },

  async attachReceipt(membership, bookingId, receiptUrl) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (LOCKED.has(booking.status)) {
      throw new ConflictError('Chuyến đã khoá', 'BOOKING_LOCKED');
    }
    return { bookingId: booking.id, receiptUrl };
  },

  /** Employee marks trip complete → PENDING_CONFIRM. */
  async complete(membership, bookingId, { actualKm, employeeNote }) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (booking.status !== 'IN_PROGRESS') {
      throw new ConflictError(
        `Chỉ complete khi IN_PROGRESS (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (actualKm == null || Number(actualKm) <= 0) {
      throw new UnprocessableError('Cần actualKm > 0', 'ACTUAL_KM_REQUIRED');
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        status: 'PENDING_CONFIRM',
        completedAt: new Date(),
        actualKm: Math.round(Number(actualKm)),
        employeeNote: employeeNote || null,
      },
    });

    await notifyCorporateAdmins(booking.corporateId, {
      type: 'CORPORATE_BOOKING_PENDING_CONFIRM',
      title: 'Chuyến cần xác nhận chi phí',
      body: `Chuyến #${booking.id} đã kết thúc, cần xác nhận chi phí`,
      link: `/corporate/bookings/${booking.id}`,
    });

    return updated;
  },

  /** Employee signs off on cost review. */
  async confirmEmployee(membership, bookingId) {
    const booking = await loadBookingForMember(membership, bookingId);
    if (booking.status !== 'PENDING_CONFIRM') {
      throw new ConflictError(
        `Chỉ confirm-employee khi PENDING_CONFIRM (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { confirmedByEmployee: true },
    });
  },

  /** Corporate Admin final company-side confirmation → CONFIRMED (pending OtoRent). */
  async confirmCorporate(membership, bookingId) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Corporate Admin xác nhận');
    }
    const booking = await loadBookingForMember(membership, bookingId);
    if (booking.status !== 'PENDING_CONFIRM') {
      throw new ConflictError(
        `Chỉ confirm-corporate khi PENDING_CONFIRM (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (!booking.confirmedByEmployee) {
      throw new ConflictError(
        'Nhân viên chưa xác nhận chi phí',
        'EMPLOYEE_CONFIRM_REQUIRED'
      );
    }

    // All expenses must be reviewed (approvedByAdmin not null)
    const pending = await prisma.tripExpense.count({
      where: { corporateBookingId: booking.id, approvedByAdmin: null },
    });
    if (pending > 0) {
      throw new ConflictError(
        `Còn ${pending} khoản chi phí chưa duyệt`,
        'PENDING_EXPENSE_APPROVAL'
      );
    }

    const expenses = await prisma.tripExpense.findMany({
      where: { corporateBookingId: booking.id },
    });
    const summary = buildCostSummary({ basePrice: booking.basePrice, expenses });

    return prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        confirmedByCorporateAdmin: true,
        finalAmount: summary.total,
        // Stay PENDING_CONFIRM until OtoRent confirms; flag corporate side done.
        // Spec: confirm-corporate → status CONFIRMED, then confirm-otorent finalises.
        // We move to CONFIRMED here and require confirm-otorent to set confirmedByOtorent.
        status: 'CONFIRMED',
      },
    });
  },

  /** OtoRent Admin final stamp. */
  async confirmOtorent(bookingId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: { expenses: true },
    });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (!booking.confirmedByCorporateAdmin) {
      throw new ConflictError(
        'Corporate Admin chưa xác nhận',
        'CORPORATE_CONFIRM_REQUIRED'
      );
    }
    if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING_CONFIRM') {
      throw new ConflictError(
        `Không confirm-otorent từ ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    return prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { confirmedByOtorent: true, status: 'CONFIRMED' },
    });
  },

  async costSummary(membership, bookingId) {
    const booking = await loadBookingForMember(membership, bookingId);
    return buildCostSummary({
      basePrice: booking.basePrice,
      expenses: booking.expenses || [],
    });
  },
};

export default tripExpenseService;
