// Marketplace Phase B — dispatch / recall / release-driver-info.
// OtoRent Admin routes a corporate booking to a Supplier (white-label) and
// later relays the assigned driver info back to the company.
import prisma from '../../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  UnprocessableError,
} from '../../../../utils/apiError.js';
import { DEFAULT_COMMISSION_RATE } from '../../../../constants/supplier.js';
import { notificationService } from '../../../../services/notificationService.js';

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
  supplier: true,
  supplierMember: {
    include: {
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  },
};

/**
 * Build the immutable "Lệnh điều xe" code for a booking.
 * Format: LDX-<bookingId>-<seq> where seq is 1-based dispatch count.
 */
export function buildDispatchRecordCode(bookingId, seq = 1) {
  return `LDX-${bookingId}-${String(seq).padStart(2, '0')}`;
}

/**
 * Commission amount = round(finalAmount × commissionRate).
 * Integer VND — no float drift.
 */
export function computeCommissionAmount(finalAmount, commissionRate) {
  if (finalAmount == null || commissionRate == null) return null;
  return Math.round(Number(finalAmount) * Number(commissionRate));
}

export const dispatchService = {
  /**
   * Dispatch (or re-dispatch) a booking to a supplier.
   * Allowed from APPROVED | DISPATCHED | DRIVER_ASSIGNED (not yet IN_PROGRESS).
   * Snapshots commissionRate from Supplier at this moment.
   * Status → DISPATCHED. Notifies supplier admins (and old supplier on re-dispatch).
   *
   * Self-fulfill (supplierId omitted / null) only from APPROVED, keeps status
   * APPROVED and auto-releases any already-known driver info so the company sees it.
   */
  async dispatch(bookingId, { supplierId, note } = {}, adminUserId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundError('Corporate booking');

    const redispatchable = ['APPROVED', 'DISPATCHED', 'DRIVER_ASSIGNED'];
    if (!redispatchable.includes(booking.status)) {
      throw new ConflictError(
        `Chỉ dispatch từ APPROVED/DISPATCHED/DRIVER_ASSIGNED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Self-fulfill path: OtoRent keeps the trip, no supplier involved.
    // Only allowed from APPROVED with no current supplier.
    if (supplierId == null) {
      if (booking.status !== 'APPROVED' || booking.supplierId) {
        throw new ConflictError(
          'Self-fulfill chỉ từ APPROVED chưa có supplier — hãy recall trước',
          'INVALID_STATUS_TRANSITION'
        );
      }
      const patch = {
        dispatchedAt: new Date(),
        dispatchedBy: adminUserId ? Number(adminUserId) : null,
        commissionRate: 0,
        commissionAmount: 0,
      };
      if (booking.driverId && !booking.driverInfoReleasedAt) {
        const driver = await prisma.user.findUnique({
          where: { id: booking.driverId },
          select: { fullName: true, phone: true },
        });
        if (driver) {
          patch.driverInfoReleasedAt = new Date();
          patch.driverInfoReleasedBy = adminUserId ? Number(adminUserId) : null;
          patch.releasedDriverInfo = JSON.stringify({
            fullName: driver.fullName,
            phone: driver.phone,
            vehicleNote: booking.vehicle?.name || null,
            licensePlate: booking.vehicle?.licensePlate || null,
          });
        }
      }
      return prisma.corporateBooking.update({
        where: { id: booking.id },
        data: patch,
        include: bookingInclude,
      });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: Number(supplierId) },
    });
    if (!supplier) throw new NotFoundError('Supplier');
    if (!supplier.isActive) {
      throw new ConflictError('Nhà cung cấp đang tạm ngưng', 'SUPPLIER_INACTIVE');
    }
    if (supplier.terminationRisk) {
      throw new ConflictError(
        'Nhà cung cấp đang có nguy cơ chấm dứt hợp đồng (SLA)',
        'SUPPLIER_TERMINATION_RISK'
      );
    }
    if (supplier.contractEnd && new Date(supplier.contractEnd).getTime() < Date.now()) {
      throw new ConflictError('Hợp đồng nhà cung cấp đã hết hạn', 'SUPPLIER_CONTRACT_EXPIRED');
    }

    // Same supplier already holding the booking with no progress → no-op conflict.
    if (
      booking.supplierId === supplier.id &&
      booking.status === 'DISPATCHED' &&
      !booking.supplierMemberId
    ) {
      throw new ConflictError(
        'Chuyến đã được dispatch cho nhà cung cấp này',
        'ALREADY_DISPATCHED'
      );
    }

    const rate =
      supplier.commissionRate != null
        ? Number(supplier.commissionRate)
        : DEFAULT_COMMISSION_RATE;

    const prevSupplierId = booking.supplierId;
    const isRedispatch = Boolean(prevSupplierId);

    // Re-dispatch clears previous assignment + any released driver info.
    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        status: 'DISPATCHED',
        supplierId: supplier.id,
        supplierMemberId: null,
        driverId: null,
        dispatchedAt: new Date(),
        dispatchedBy: adminUserId ? Number(adminUserId) : null,
        commissionRate: rate,
        commissionAmount: null,
        supplierVehicleNote: note || null,
        driverInfoReleasedAt: null,
        driverInfoReleasedBy: null,
        releasedDriverInfo: null,
      },
      include: bookingInclude,
    });

    // Notify previous supplier that the trip was pulled.
    if (isRedispatch && prevSupplierId && prevSupplierId !== supplier.id) {
      await notificationService.notifySupplierAdmins(prevSupplierId, {
        type: 'SUPPLIER_BOOKING_RECALLED',
        title: 'Chuyến đã chuyển sang nhà cung cấp khác',
        body: `Chuyến #${updated.id} đã được OtoRent điều phối lại.`,
        link: `/supplier/bookings`,
      });
    }

    await notificationService.notifySupplierAdmins(supplier.id, {
      type: 'SUPPLIER_BOOKING_DISPATCHED',
      title: isRedispatch ? 'Có chuyến được điều phối lại' : 'Có chuyến mới cần phân công tài xế',
      body: `Chuyến #${updated.id} — ${updated.pickupAddress} → ${updated.dropoffAddress}`,
      link: `/supplier/bookings/${updated.id}`,
    });

    // Seq bumps on every re-dispatch so LDX codes stay unique/auditable.
    const dispatchCount = isRedispatch ? 2 : 1;
    return {
      ...updated,
      dispatchRecordCode: buildDispatchRecordCode(updated.id, dispatchCount),
      redispatched: isRedispatch,
    };
  },

  /**
   * Recall a DISPATCHED (or DRIVER_ASSIGNED, not yet started) booking from its
   * supplier. Clears supplier fields and returns status to APPROVED.
   */
  async recall(bookingId, { reason } = {}, adminUserId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundError('Corporate booking');

    if (!['DISPATCHED', 'DRIVER_ASSIGNED'].includes(booking.status)) {
      throw new ConflictError(
        `Chỉ recall từ DISPATCHED/DRIVER_ASSIGNED (hiện: ${booking.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (!booking.supplierId) {
      throw new ConflictError('Chuyến chưa được dispatch', 'NOT_DISPATCHED');
    }

    const prevSupplierId = booking.supplierId;

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
        supplierVehicleNote: reason
          ? `Recalled: ${String(reason).trim()}`
          : null,
        driverInfoReleasedAt: null,
        driverInfoReleasedBy: null,
        releasedDriverInfo: null,
        driverId: null,
      },
      include: bookingInclude,
    });

    await notificationService.notifySupplierAdmins(prevSupplierId, {
      type: 'SUPPLIER_BOOKING_RECALLED',
      title: 'Chuyến đã bị thu hồi',
      body: reason
        ? `Chuyến #${updated.id} bị thu hồi: ${reason}`
        : `Chuyến #${updated.id} đã bị OtoRent thu hồi.`,
      link: `/supplier/bookings`,
    });

    // Soft-log adminUserId for audit (no dedicated audit table yet).
    void adminUserId;

    return updated;
  },

  /**
   * Release the assigned driver info to the company (white-label handoff).
   * Only allowed when status is DRIVER_ASSIGNED (or self-fulfill APPROVED with driver).
   * Company then sees `releasedDriverInfo = {fullName, phone, vehicleNote?, licensePlate?}`.
   */
  async releaseDriverInfo(bookingId, adminUserId, overrides = {}) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: {
        ...bookingInclude,
        supplierMember: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, email: true } },
          },
        },
      },
    });
    if (!booking) throw new NotFoundError('Corporate booking');

    if (booking.driverInfoReleasedAt) {
      throw new ConflictError(
        'Thông tin tài xế đã được chuyển cho doanh nghiệp',
        'ALREADY_RELEASED'
      );
    }

    // Must have a supplier-assigned driver OR a self-fulfill driverId.
    const member = booking.supplierMember;
    const driverUser = member?.user;
    let fullName = overrides.fullName || member?.fullName || driverUser?.fullName || null;
    let phone = overrides.phone || driverUser?.phone || null;
    const vehicleNote =
      overrides.vehicleNote || booking.supplierVehicleNote || booking.vehicle?.name || null;
    const licensePlate = overrides.licensePlate || booking.vehicle?.licensePlate || null;

    // Self-fulfill fallback: use booking.driverId.
    if (!fullName && booking.driverId) {
      const driver = await prisma.user.findUnique({
        where: { id: booking.driverId },
        select: { fullName: true, phone: true },
      });
      if (driver) {
        fullName = driver.fullName;
        phone = driver.phone;
      }
    }

    if (!fullName || !phone) {
      throw new UnprocessableError(
        'Chưa có thông tin tài xế để chuyển — supplier phải assign-driver trước',
        'DRIVER_INFO_MISSING'
      );
    }

    // Status must be DRIVER_ASSIGNED (supplier path) or APPROVED (self-fulfill).
    if (!['DRIVER_ASSIGNED', 'APPROVED', 'DISPATCHED'].includes(booking.status)) {
      throw new ConflictError(
        `Không release-driver-info từ ${booking.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const payload = { fullName, phone, vehicleNote, licensePlate };

    const updated = await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: {
        driverInfoReleasedAt: new Date(),
        driverInfoReleasedBy: adminUserId ? Number(adminUserId) : null,
        releasedDriverInfo: JSON.stringify(payload),
        // Keep status as-is (DRIVER_ASSIGNED / APPROVED); startTrip advances it.
      },
      include: bookingInclude,
    });

    // Notify the company employee + corporate admins.
    const empUserId = updated.employee?.user?.id;
    if (empUserId) {
      await notificationService.notify({
        userId: empUserId,
        type: 'CORPORATE_DRIVER_INFO',
        title: 'Đã có thông tin tài xế',
        body: `Chuyến #${updated.id}: tài xế ${fullName} (${phone}).`,
        link: `/corporate/bookings/${updated.id}`,
      });
    }
    const admins = await prisma.corporateEmployee.findMany({
      where: {
        corporateId: updated.corporateId,
        isAdmin: true,
        isActive: true,
        userId: { not: null },
      },
      select: { userId: true },
    });
    await Promise.all(
      admins
        .filter((a) => a.userId !== empUserId)
        .map((a) =>
          notificationService.notify({
            userId: a.userId,
            type: 'CORPORATE_DRIVER_INFO',
            title: 'Đã có thông tin tài xế',
            body: `Chuyến #${updated.id}: tài xế ${fullName} (${phone}).`,
            link: `/corporate/bookings/${updated.id}`,
          })
        )
    );

    return {
      ...updated,
      releasedDriverInfo: payload,
    };
  },

  /**
   * Compute and persist commissionAmount when a booking is settled.
   * Called from settlementService.create for each booking that has a rate.
   */
  async applyCommissionOnSettle(bookingIds) {
    if (!bookingIds?.length) return 0;
    const bookings = await prisma.corporateBooking.findMany({
      where: {
        id: { in: bookingIds.map(Number) },
        commissionRate: { not: null },
        finalAmount: { not: null },
      },
      select: { id: true, finalAmount: true, commissionRate: true },
    });
    let count = 0;
    for (const b of bookings) {
      const amount = computeCommissionAmount(b.finalAmount, b.commissionRate);
      if (amount == null) continue;
      await prisma.corporateBooking.update({
        where: { id: b.id },
        data: { commissionAmount: amount },
      });
      count += 1;
    }
    return count;
  },

  /**
   * Export the "Lệnh điều xe" (dispatch record) for a booking.
   * Immutable snapshot used as a payout supporting document (HĐ CCDV Điều 2).
   */
  async exportDispatchRecord(bookingId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            taxCode: true,
            contactName: true,
            contactPhone: true,
            contractRef: true,
            transportLicenseNo: true,
          },
        },
        supplierMember: {
          include: {
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        corporate: {
          select: { id: true, name: true, taxCode: true },
        },
      },
    });
    if (!booking) throw new NotFoundError('Corporate booking');
    if (!booking.supplierId || !booking.dispatchedAt) {
      throw new ConflictError(
        'Chuyến chưa được dispatch — không có lệnh điều xe',
        'NOT_DISPATCHED'
      );
    }

    const code = buildDispatchRecordCode(booking.id, 1);
    const finalAmount = booking.finalAmount != null ? Number(booking.finalAmount) : null;
    const commissionRate = booking.commissionRate != null ? Number(booking.commissionRate) : null;
    const commissionAmount =
      booking.commissionAmount != null
        ? Number(booking.commissionAmount)
        : computeCommissionAmount(finalAmount, commissionRate);
    const supplierPayout =
      finalAmount != null && commissionAmount != null
        ? Math.round(finalAmount - commissionAmount)
        : null;

    return {
      dispatchRecordCode: code,
      issuedAt: booking.dispatchedAt,
      issuedBy: booking.dispatchedBy,
      booking: {
        id: booking.id,
        status: booking.status,
        pickupAt: booking.pickupAt,
        returnAt: booking.returnAt,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        vehicleType: booking.vehicleType,
        rentalType: booking.rentalType,
        estimatedKm: booking.estimatedKm,
        actualKm: booking.actualKm,
        supplierVehicleNote: booking.supplierVehicleNote,
      },
      // OtoRent-internal: corporate identity is on the LDX for OtoRent's own records,
      // not exposed to the supplier portal.
      corporate: booking.corporate
        ? { id: booking.corporate.id, name: booking.corporate.name, taxCode: booking.corporate.taxCode }
        : null,
      supplier: booking.supplier,
      driver: booking.supplierMember
        ? {
            memberId: booking.supplierMember.id,
            fullName: booking.supplierMember.fullName || booking.supplierMember.user?.fullName || null,
            phone: booking.supplierMember.user?.phone || null,
          }
        : null,
      financials: {
        finalAmount,
        commissionRate,
        commissionAmount,
        supplierPayout,
      },
    };
  },
};

export default dispatchService;
