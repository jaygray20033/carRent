// src/api/v1/corporate/corporateBooking.service.js
// B2B Day 3 — UC-64/65 create, list, approve, reject, cancel corporate bookings.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import { calculateBasePrice } from '../../../services/corporatePricing.service.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';
import { notificationService } from '../../../services/notificationService.js';
import { stripBookingForCorporate } from '../../../constants/supplier.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const bookingInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      department: true,
      isAdmin: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  },
  vehicle: {
    select: { id: true, name: true, licensePlate: true, seats: true, status: true },
  },
  expenses: true,
  bookingVAS: { include: { vas: true } },
  corporate: {
    select: {
      id: true,
      name: true,
      taxCode: true,
      isActive: true,
      contractEnd: true,
      priceConfig: true,
    },
  },
};

function assertClientActive(corporate) {
  if (!corporate) throw new NotFoundError('Corporate client');
  if (!corporate.isActive) {
    throw new ConflictError('Công ty đang tạm ngưng', 'CLIENT_INACTIVE');
  }
  if (corporate.contractEnd && new Date(corporate.contractEnd).getTime() < Date.now()) {
    throw new ConflictError('Hợp đồng đã hết hạn', 'CONTRACT_EXPIRED');
  }
}

function assertEmployeeActive(membership) {
  if (!membership || !membership.isActive) {
    throw new ConflictError('Nhân viên chưa kích hoạt', 'EMPLOYEE_INACTIVE');
  }
}

function validateTimeRange(pickupAt, returnAt) {
  const pickup = new Date(pickupAt);
  const ret = new Date(returnAt);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(ret.getTime())) {
    throw new UnprocessableError('Thời gian không hợp lệ', 'INVALID_TIME_RANGE');
  }
  if (pickup.getTime() < Date.now() + TWO_HOURS_MS) {
    throw new UnprocessableError(
      'Cần đặt trước ít nhất 2 tiếng',
      'BOOKING_TOO_SOON'
    );
  }
  if (ret.getTime() <= pickup.getTime()) {
    throw new UnprocessableError(
      'Giờ trả phải sau giờ đón',
      'INVALID_TIME_RANGE'
    );
  }
  return { pickup, ret };
}

async function notifyCorporateAdmins(corporateId, { type, title, body, link }) {
  const admins = await prisma.corporateEmployee.findMany({
    where: { corporateId, isAdmin: true, isActive: true, userId: { not: null } },
    select: { userId: true },
  });
  await Promise.all(
    admins.map((a) =>
      notificationService.notify({ userId: a.userId, type, title, body, link })
    )
  );
}

export const corporateBookingService = {
  async create(membership, data) {
    assertEmployeeActive(membership);
    const corporate = await prisma.corporateClient.findUnique({
      where: { id: membership.corporateId },
    });
    assertClientActive(corporate);

    const { pickup, ret } = validateTimeRange(data.pickupAt, data.returnAt);

    const { basePrice } = calculateBasePrice({
      vehicleType: data.vehicleType,
      rentalType: data.rentalType,
      estimatedKm: data.estimatedKm,
      priceConfig: corporate.priceConfig,
    });

    // When the company enables auto-approve, employee bookings skip the
    // corporate-admin gate and land straight in APPROVED.
    const autoApprove = Boolean(corporate.autoApproveBookings);

    const booking = await prisma.corporateBooking.create({
      data: {
        corporateId: corporate.id,
        employeeId: membership.id,
        purpose: data.purpose || null,
        pickupAt: pickup,
        returnAt: ret,
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        estimatedKm: Number(data.estimatedKm),
        basePrice,
        rentalType: data.rentalType,
        vehicleType: data.vehicleType,
        status: autoApprove ? 'APPROVED' : 'PENDING',
        vehicleId: data.vehicleId ? Number(data.vehicleId) : null,
      },
      include: bookingInclude,
    });

    const empName = membership.user?.fullName || 'Nhân viên';
    if (autoApprove) {
      // No approval needed — just let admins know a trip was booked.
      await notifyCorporateAdmins(corporate.id, {
        type: 'CORPORATE_BOOKING_CREATED',
        title: 'Có chuyến đặt xe mới (tự động duyệt)',
        body: `${empName} vừa đặt xe — tự động duyệt theo cấu hình công ty.`,
        link: `/enterprise/schedule`,
      });
    } else {
      await notifyCorporateAdmins(corporate.id, {
        type: 'CORPORATE_BOOKING_CREATED',
        title: 'Có yêu cầu đặt xe mới',
        body: `Có yêu cầu đặt xe mới từ ${empName} cần duyệt`,
        link: `/enterprise/schedule`,
      });
    }

    return stripBookingForCorporate(booking);
  },

  async list(membership, { status, employeeId, month, page = 1, size = 20 } = {}) {
    const where = { corporateId: membership.corporateId };
    if (!membership.isAdmin) {
      where.employeeId = membership.id;
    } else if (employeeId) {
      where.employeeId = Number(employeeId);
    }
    if (status) where.status = status;
    if (month) {
      // month = "YYYY-MM"
      const [y, m] = String(month).split('-').map(Number);
      if (y && m) {
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 1));
        where.pickupAt = { gte: start, lt: end };
      }
    }

    const [items, total] = await Promise.all([
      prisma.corporateBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.corporateBooking.count({ where }),
    ]);
    return { items: items.map(stripBookingForCorporate), total, page, size };
  },

  async getById(membership, id) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(id) },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (booking.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Không thuộc công ty của bạn');
    }
    if (!membership.isAdmin && booking.employeeId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ xem được chuyến của mình');
    }
    return stripBookingForCorporate(booking);
  },

  async approve(membership, id, { vehicleId, driverId } = {}) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin được duyệt');
    const booking = await this.getById(membership, id);
    if (booking.status !== 'PENDING') {
      throw new ConflictError(
        `Không thể duyệt từ trạng thái ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        status: 'APPROVED',
        vehicleId: vehicleId != null ? Number(vehicleId) : booking.vehicleId,
        driverId: driverId != null ? Number(driverId) : booking.driverId,
      },
      include: bookingInclude,
    });

    const empUserId = updated.employee?.user?.id;
    if (empUserId) {
      await notificationService.notify({
        userId: empUserId,
        type: 'CORPORATE_BOOKING_APPROVED',
        title: 'Yêu cầu đặt xe đã được duyệt',
        body: `Chuyến #${updated.id} đã được Corporate Admin duyệt.`,
        link: `/enterprise/schedule`,
      });
    }
    return stripBookingForCorporate(updated);
  },

  async reject(membership, id, { reason }) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin được từ chối');
    if (!reason || !String(reason).trim()) {
      throw new UnprocessableError('Vui lòng nhập lý do từ chối', 'REASON_REQUIRED');
    }
    const booking = await this.getById(membership, id);
    if (booking.status !== 'PENDING') {
      throw new ConflictError(
        `Không thể từ chối từ trạng thái ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', rejectReason: String(reason).trim() },
      include: bookingInclude,
    });

    const empUserId = updated.employee?.user?.id;
    if (empUserId) {
      await notificationService.notify({
        userId: empUserId,
        type: 'CORPORATE_BOOKING_REJECTED',
        title: 'Yêu cầu đặt xe bị từ chối',
        body: reason,
        link: `/enterprise/schedule`,
      });
    }
    return stripBookingForCorporate(updated);
  },

  async cancel(membership, id) {
    const booking = await this.getById(membership, id);

    // Only owner (or admin) may cancel
    if (!membership.isAdmin && booking.employeeId !== membership.id) {
      throw new ForbiddenError('Bạn chỉ huỷ được chuyến của mình');
    }

    if (booking.status === 'IN_PROGRESS') {
      throw new ConflictError(
        'Không thể huỷ chuyến đang diễn ra',
        'CANNOT_CANCEL_IN_PROGRESS'
      );
    }
    // Marketplace: also allow cancel while still with supplier (not yet started).
    if (!['PENDING', 'APPROVED', 'DISPATCHED', 'DRIVER_ASSIGNED'].includes(booking.status)) {
      throw new ConflictError(
        `Không thể huỷ từ trạng thái ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (new Date(booking.pickupAt).getTime() < Date.now() + TWO_HOURS_MS) {
      throw new ConflictError(
        'Chỉ huỷ được khi còn > 2h trước giờ đi',
        'CANCEL_TOO_LATE'
      );
    }

    // Capture supplier before cancel so we can notify them (white-label: they just see cancel).
    const raw = await prisma.corporateBooking.findUnique({
      where: { id: booking.id },
      select: { supplierId: true },
    });

    const cancelled = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: bookingInclude,
    });

    if (raw?.supplierId) {
      await notificationService.notifySupplierAdmins(raw.supplierId, {
        type: 'SUPPLIER_BOOKING_CANCELLED',
        title: 'Chuyến đã bị huỷ',
        body: `Chuyến #${cancelled.id} đã bị huỷ bởi doanh nghiệp.`,
        link: `/supplier/bookings`,
      });
    }

    return stripBookingForCorporate(cancelled);
  },

  /**
   * UC-72 — CarGoGo Admin list all B2B bookings (cross-company).
   * Filters: corporateId, status, driverId, from/to (pickupAt range).
   */
  async adminList({
    corporateId,
    status,
    driverId,
    supplierId,
    awaitingDriverRelease,
    from,
    to,
    page = 1,
    size = 20,
  } = {}) {
    const where = {};
    if (corporateId) where.corporateId = Number(corporateId);
    if (status) where.status = status;
    if (driverId) where.driverId = Number(driverId);
    if (supplierId) where.supplierId = Number(supplierId);
    // DRIVER_ASSIGNED but CarGoGo has not yet released driver info to the company.
    if (awaitingDriverRelease === true || awaitingDriverRelease === 'true') {
      where.status = 'DRIVER_ASSIGNED';
      where.driverInfoReleasedAt = null;
      where.supplierId = { not: null };
    }
    if (from || to) {
      where.pickupAt = {};
      if (from) where.pickupAt.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        // inclusive end-of-day when date-only
        if (!String(to).includes('T')) end.setHours(23, 59, 59, 999);
        where.pickupAt.lte = end;
      }
    }

    const [items, total] = await Promise.all([
      prisma.corporateBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.corporateBooking.count({ where }),
    ]);
    return { items, total, page, size };
  },

  /**
   * UC-72 — assign driver + optional vehicle on APPROVED (or PENDING) bookings.
   * Not allowed once trip has started (IN_PROGRESS+) or is CANCELLED/SETTLED.
   */
  async assignDriver(bookingId, { driverId, vehicleId }) {
    if (driverId == null) {
      throw new UnprocessableError('driverId là bắt buộc', 'DRIVER_REQUIRED');
    }
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundError('Corporate booking');

    if (['IN_PROGRESS', 'PENDING_CONFIRM', 'CONFIRMED', 'SETTLED', 'CANCELLED'].includes(booking.status)) {
      throw new ConflictError(
        `Không thể assign tài xế khi status ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Validate driver user exists
    const driver = await prisma.user.findUnique({
      where: { id: Number(driverId) },
      select: { id: true, fullName: true, phone: true, status: true },
    });
    if (!driver) throw new NotFoundError('Driver');

    if (vehicleId != null) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: Number(vehicleId) } });
      if (!vehicle) throw new NotFoundError('Vehicle');
    }

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        driverId: Number(driverId),
        vehicleId: vehicleId != null ? Number(vehicleId) : booking.vehicleId,
      },
      include: bookingInclude,
    });

    const empUserId = updated.employee?.user?.id;
    if (empUserId) {
      await notificationService.notify({
        userId: empUserId,
        type: 'CORPORATE_DRIVER_ASSIGNED',
        title: 'Đã phân công tài xế',
        body: `Chuyến #${updated.id}: tài xế ${driver.fullName} (${driver.phone}).`,
        link: `/enterprise/schedule`,
      });
    }

    return { ...updated, driver };
  },

  /** CarGoGo Admin / operator advances APPROVED → IN_PROGRESS (start trip). */
  async startTrip(bookingId) {
    const booking = await prisma.corporateBooking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (booking.status !== 'APPROVED') {
      throw new ConflictError(
        `Chỉ start từ APPROVED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { status: 'IN_PROGRESS' },
      include: bookingInclude,
    });
  },

  async getPriceConfigForMembership(membership) {
    assertEmployeeActive(membership);
    const corporate = await prisma.corporateClient.findUnique({
      where: { id: membership.corporateId },
    });
    assertClientActive(corporate);
    const { parsePriceConfig } = await import('../../../services/corporatePricing.service.js');
    return parsePriceConfig(corporate.priceConfig);
  },

  async costSummary(membership, id) {
    const booking = await this.getById(membership, id);
    return buildCostSummary({
      basePrice: booking.basePrice,
      expenses: booking.expenses || [],
      vasLines: booking.bookingVAS || [],
    });
  },
};

export default corporateBookingService;
