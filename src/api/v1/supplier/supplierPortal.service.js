// Marketplace Phase C — supplier portal ops.
// Supplier Admin: list/view dispatched bookings, assign driver, reject.
// Supplier Member (driver): start (only after CarGoGo released driver info), complete.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import { stripBookingForSupplier } from '../../../constants/supplier.js';
import { notificationService } from '../../../services/notificationService.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';
import { settingsService } from '../../../services/settingsService.js';
import { dispatchService } from '../admin/suppliers/dispatch.service.js';
import { TRIP_EXPENSE_TYPES } from '../../../constants/corporatePricing.js';
import logger from '../../../config/logger.js';

// A driver can only add/remove trip expenses while the trip is live or the cost
// is still being confirmed. After CONFIRMED/SETTLED/CANCELLED the ledger is frozen.
const EXPENSE_OPEN_STATUSES = new Set(['IN_PROGRESS', 'PENDING_CONFIRM']);

/**
 * Global toggle (SiteSetting key `auto_release_driver_info`): when on, CarGoGo
 * relays supplier-assigned driver info to the company automatically instead of
 * waiting for an admin to release it manually. Defaults OFF.
 */
async function isAutoReleaseOn() {
  try {
    const map = await settingsService.getMap();
    return String(map.auto_release_driver_info) === 'true';
  } catch (err) {
    logger.warn(`auto-release setting read failed: ${err.message}`);
    return false;
  }
}

const bookingInclude = {
  vehicle: {
    select: { id: true, name: true, licensePlate: true, seats: true, status: true },
  },
  expenses: true,
  bookingVAS: { include: { vas: true } },
  supplierMember: {
    include: {
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  },
  employee: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, fullName: true } },
    },
  },
};

async function loadScopedBooking(membership, bookingId) {
  const booking = await prisma.corporateBooking.findUnique({
    where: { id: Number(bookingId) },
    include: bookingInclude,
  });
  if (!booking) throw new NotFoundError('Booking');
  if (booking.supplierId !== membership.supplierId) {
    throw new ForbiddenError('Chuyến không thuộc nhà cung cấp của bạn');
  }
  return booking;
}

/** White-label notify to company employee + corporate admins (never mentions supplier). */
async function notifyCompanyAboutTrip(booking, { type, title, body }) {
  const link = `/corporate/bookings/${booking.id}`;
  const empUserId = booking.employee?.user?.id || booking.employee?.userId || null;
  if (empUserId) {
    await notificationService.notify({ userId: empUserId, type, title, body, link });
  }
  const admins = await prisma.corporateEmployee.findMany({
    where: {
      corporateId: booking.corporateId,
      isAdmin: true,
      isActive: true,
      userId: { not: null },
    },
    select: { userId: true },
  });
  await Promise.all(
    admins
      .filter((a) => a.userId !== empUserId)
      .map((a) => notificationService.notify({ userId: a.userId, type, title, body, link }))
  );
}

export const supplierPortalService = {
  async getMe(membership) {
    return {
      membership: {
        id: membership.id,
        supplierId: membership.supplierId,
        fullName: membership.fullName,
        isAdmin: membership.isAdmin,
        isActive: membership.isActive,
        user: membership.user,
      },
      supplier: {
        id: membership.supplier.id,
        name: membership.supplier.name,
        taxCode: membership.supplier.taxCode,
        address: membership.supplier.address,
        contactName: membership.supplier.contactName,
        contactPhone: membership.supplier.contactPhone,
        contactEmail: membership.supplier.contactEmail,
        contractRef: membership.supplier.contractRef,
        contractEnd: membership.supplier.contractEnd,
        transportLicenseNo: membership.supplier.transportLicenseNo,
        criticalViolationCount: membership.supplier.criticalViolationCount,
        terminationRisk: membership.supplier.terminationRisk,
        isActive: membership.supplier.isActive,
        // Intentionally omit commissionRate — margin is CarGoGo-only.
      },
    };
  },

  async listBookings(membership, { status, page = 1, size = 20 } = {}) {
    const where = { supplierId: membership.supplierId };
    // Drivers only see bookings assigned to them; admins see all for the supplier.
    if (!membership.isAdmin) {
      where.supplierMemberId = membership.id;
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.corporateBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: [{ pickupAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.corporateBooking.count({ where }),
    ]);

    return {
      items: items.map(stripBookingForSupplier),
      total,
      page,
      size,
    };
  },

  async getBooking(membership, id) {
    const booking = await loadScopedBooking(membership, id);
    // Drivers can only open their own assigned bookings.
    if (!membership.isAdmin && booking.supplierMemberId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ xem được chuyến được phân công cho mình');
    }
    return stripBookingForSupplier(booking);
  },

  /**
   * Supplier Admin assigns (or re-assigns) a driver.
   * - First assign: DISPATCHED → DRIVER_ASSIGNED
   * - Re-assign before release: DRIVER_ASSIGNED + driverInfoReleasedAt=null → overwrite
   * - Re-assign after release: clear releasedDriverInfo, force CarGoGo to re-release
   * Never notifies the company — only CarGoGo + the new driver.
   */
  async assignDriver(membership, bookingId, { memberId, vehicleNote, licensePlate }) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Supplier Admin được phân công tài xế');
    }
    if (memberId == null) {
      throw new UnprocessableError('memberId là bắt buộc', 'MEMBER_REQUIRED');
    }

    const booking = await loadScopedBooking(membership, bookingId);
    if (!['DISPATCHED', 'DRIVER_ASSIGNED'].includes(booking.status)) {
      throw new ConflictError(
        `Chỉ assign-driver từ DISPATCHED/DRIVER_ASSIGNED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const member = await prisma.supplierMember.findFirst({
      where: {
        id: Number(memberId),
        supplierId: membership.supplierId,
        isActive: true,
      },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
      },
    });
    if (!member) throw new NotFoundError('Supplier member');
    if (!member.userId) {
      throw new ConflictError(
        'Thành viên chưa kích hoạt tài khoản — không thể gán',
        'MEMBER_INACTIVE'
      );
    }

    const noteParts = [];
    if (vehicleNote) noteParts.push(String(vehicleNote).trim());
    if (licensePlate) noteParts.push(`BSX: ${String(licensePlate).trim()}`);
    const combinedNote = noteParts.length
      ? noteParts.join(' | ')
      : booking.supplierVehicleNote;

    // Re-assign after release forces CarGoGo to release again before DN sees the new driver.
    const wasReleased = Boolean(booking.driverInfoReleasedAt);
    const patch = {
      status: 'DRIVER_ASSIGNED',
      supplierMemberId: member.id,
      driverId: member.userId,
      supplierVehicleNote: combinedNote,
    };
    if (wasReleased) {
      patch.driverInfoReleasedAt = null;
      patch.driverInfoReleasedBy = null;
      patch.releasedDriverInfo = null;
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: patch,
      include: bookingInclude,
    });

    const driverLabel = member.fullName || member.user?.fullName;
    if (wasReleased) {
      await notificationService.notifyRoles({
        roles: ['ADMIN', 'OPERATOR'],
        type: 'SUPPLIER_DRIVER_REASSIGNED',
        title: 'Supplier đổi tài xế — cần release lại cho DN',
        body: `Chuyến #${updated.id}: tài xế mới ${driverLabel} (${member.user?.phone}). Thông tin cũ đã thu hồi.`,
        link: `/admin/corporate/bookings`,
      });
    } else {
      await notificationService.notifyRoles({
        roles: ['ADMIN', 'OPERATOR'],
        type: 'SUPPLIER_DRIVER_ASSIGNED',
        title: 'Supplier đã gán tài xế — cần chuyển info cho DN',
        body: `Chuyến #${updated.id}: ${driverLabel} (${member.user?.phone}).`,
        link: `/admin/corporate/bookings`,
      });
    }

    if (member.userId) {
      await notificationService.notify({
        userId: member.userId,
        type: 'SUPPLIER_TRIP_ASSIGNED',
        title: 'Bạn được phân công chuyến mới',
        body: `Chuyến #${updated.id} — ${updated.pickupAddress} → ${updated.dropoffAddress}`,
        link: `/supplier/bookings/${updated.id}`,
      });
    }

    // Global auto-release: if CarGoGo has turned on auto driver-info handoff,
    // relay the assigned driver to the company immediately (no manual step),
    // so the supplier can start the trip right away.
    if (await isAutoReleaseOn()) {
      try {
        await dispatchService.releaseDriverInfo(updated.id, null);
        const refreshed = await loadScopedBooking(membership, updated.id);
        return stripBookingForSupplier(refreshed);
      } catch (err) {
        // Auto-release is best-effort; fall back to the manual CarGoGo step.
        logger.warn(`auto-release driver info failed for #${updated.id}: ${err.message}`);
      }
    }

    return stripBookingForSupplier(updated);
  },

  /**
   * Supplier Admin rejects a DISPATCHED booking. Status → APPROVED, clears
   * supplier fields so CarGoGo can re-dispatch.
   */
  async reject(membership, bookingId, { reason }) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Supplier Admin được từ chối chuyến');
    }
    if (!reason || !String(reason).trim()) {
      throw new UnprocessableError('Vui lòng nhập lý do từ chối', 'REASON_REQUIRED');
    }

    const booking = await loadScopedBooking(membership, bookingId);
    if (booking.status !== 'DISPATCHED') {
      throw new ConflictError(
        `Chỉ reject từ DISPATCHED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        status: 'APPROVED',
        supplierId: null,
        supplierMemberId: null,
        dispatchedAt: null,
        dispatchedBy: null,
        commissionRate: null,
        commissionAmount: null,
        supplierVehicleNote: `Supplier rejected: ${String(reason).trim()}`,
        driverInfoReleasedAt: null,
        driverInfoReleasedBy: null,
        releasedDriverInfo: null,
        driverId: null,
      },
      include: bookingInclude,
    });

    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'SUPPLIER_BOOKING_REJECTED',
      title: 'Supplier từ chối chuyến',
      body: `Chuyến #${updated.id}: ${reason}`,
      link: `/admin/corporate/bookings`,
    });

    return stripBookingForSupplier(updated);
  },

  /**
   * Start trip. Allowed for the assigned driver (or supplier admin) once
   * CarGoGo has released the driver info (or self-fulfill with no supplier).
   * Status DRIVER_ASSIGNED | APPROVED → IN_PROGRESS.
   */
  async startTrip(membership, bookingId) {
    const booking = await loadScopedBooking(membership, bookingId);

    // Drivers can only start their own assigned trip.
    if (!membership.isAdmin && booking.supplierMemberId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ start được chuyến được phân công cho mình');
    }

    if (!['DRIVER_ASSIGNED', 'APPROVED'].includes(booking.status)) {
      throw new ConflictError(
        `Chỉ start từ DRIVER_ASSIGNED/APPROVED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Marketplace rule: company must have been told who the driver is before the
    // trip can start (so the passenger can identify the car/driver).
    if (booking.supplierId && !booking.driverInfoReleasedAt) {
      throw new ConflictError(
        'CarGoGo chưa chuyển thông tin tài xế cho doanh nghiệp — không thể bắt đầu',
        'DRIVER_INFO_NOT_RELEASED'
      );
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { status: 'IN_PROGRESS' },
      include: bookingInclude,
    });

    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'SUPPLIER_TRIP_STARTED',
      title: 'Chuyến supplier đã bắt đầu',
      body: `Chuyến #${updated.id} đang diễn ra.`,
      link: `/admin/corporate/bookings`,
    });

    // White-label notify to company (no supplier name).
    await notifyCompanyAboutTrip(updated, {
      type: 'CORPORATE_TRIP_STARTED',
      title: 'Chuyến đã bắt đầu',
      body: `Chuyến #${updated.id} đang được thực hiện.`,
    });

    return stripBookingForSupplier(updated);
  },

  /**
   * Complete trip from the supplier side → PENDING_CONFIRM.
   * Mirrors tripExpenseService.complete but scoped to supplier membership.
   */
  async complete(membership, bookingId, { actualKm, note } = {}) {
    const booking = await loadScopedBooking(membership, bookingId);

    if (!membership.isAdmin && booking.supplierMemberId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ complete được chuyến được phân công cho mình');
    }
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
        driverNote: note || null,
      },
      include: bookingInclude,
    });

    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'SUPPLIER_TRIP_COMPLETED',
      title: 'Chuyến supplier đã hoàn thành',
      body: `Chuyến #${updated.id} chờ xác nhận chi phí.`,
      link: `/admin/corporate/bookings`,
    });

    await notifyCompanyAboutTrip(updated, {
      type: 'CORPORATE_TRIP_COMPLETED',
      title: 'Chuyến đã hoàn thành — cần xác nhận chi phí',
      body: `Chuyến #${updated.id} đã kết thúc, vui lòng xác nhận chi phí.`,
    });

    return stripBookingForSupplier(updated);
  },

  // ── Trip expenses (driver logs tolls, parking, overtime… on the road) ──
  // Recorded by the assigned driver (or supplier admin). Only mutable while the
  // trip is running or awaiting cost confirmation; admin approval (approvedByAdmin)
  // happens on the CarGoGo side and locks the line from driver deletion.
  async addExpense(membership, bookingId, data) {
    const booking = await loadScopedBooking(membership, bookingId);
    if (!membership.isAdmin && booking.supplierMemberId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ ghi chi phí cho chuyến được phân cho mình');
    }
    if (!EXPENSE_OPEN_STATUSES.has(booking.status)) {
      throw new ConflictError(
        `Chỉ ghi chi phí khi IN_PROGRESS/PENDING_CONFIRM (hiện: ${booking.status})`,
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

    await prisma.tripExpense.create({
      data: {
        corporateBookingId: booking.id,
        type: data.type,
        amount,
        description: data.description || null,
        receiptUrl: data.receiptUrl || null,
        recordedBy: 'driver',
        approvedByAdmin: null, // pending CarGoGo review
      },
    });

    const refreshed = await loadScopedBooking(membership, booking.id);
    return this.buildExpenseView(refreshed);
  },

  async listExpenses(membership, bookingId) {
    const booking = await loadScopedBooking(membership, bookingId);
    return this.buildExpenseView(booking);
  },

  async deleteExpense(membership, bookingId, expenseId) {
    const booking = await loadScopedBooking(membership, bookingId);
    if (!membership.isAdmin && booking.supplierMemberId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ xoá chi phí cho chuyến được phân cho mình');
    }
    if (!EXPENSE_OPEN_STATUSES.has(booking.status)) {
      throw new ConflictError('Chuyến đã khoá, không sửa chi phí', 'BOOKING_LOCKED');
    }
    const expense = await prisma.tripExpense.findFirst({
      where: { id: Number(expenseId), corporateBookingId: booking.id },
    });
    if (!expense) throw new NotFoundError('Expense');
    if (expense.recordedBy !== 'driver') {
      throw new ForbiddenError('Chỉ xoá được chi phí do tài xế ghi');
    }
    if (expense.approvedByAdmin === true) {
      throw new ConflictError('Không xoá được chi phí đã duyệt', 'EXPENSE_ALREADY_APPROVED');
    }

    await prisma.tripExpense.delete({ where: { id: expense.id } });
    const refreshed = await loadScopedBooking(membership, booking.id);
    return this.buildExpenseView(refreshed);
  },

  /** Shape a booking's expenses for the supplier UI (no basePrice / margin). */
  buildExpenseView(booking) {
    const summary = buildCostSummary({
      basePrice: 0, // hide base — supplier must not see CarGoGo's margin
      expenses: booking.expenses || [],
      vasLines: [],
    });
    return {
      expenses: summary.expenses,
      expenseTotal: summary.expenseTotal,
    };
  },

  async costSummary(membership, bookingId) {
    const booking = await loadScopedBooking(membership, bookingId);
    // Supplier must not see CarGoGo's margin. Return only expense lines, no totals
    // that reveal basePrice. They see the operational expenses they recorded.
    return this.buildExpenseView(booking);
  },
};

export default supplierPortalService;
