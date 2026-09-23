import prisma from '../../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../../utils/apiError.js';
import { notificationService } from '../../../../services/notificationService.js';

const settlementInclude = {
  supplier: {
    select: {
      id: true,
      name: true,
      taxCode: true,
      address: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      contractRef: true,
    },
  },
  bookings: {
    select: {
      id: true,
      status: true,
      pickupAt: true,
      returnAt: true,
      completedAt: true,
      pickupAddress: true,
      dropoffAddress: true,
      vehicleType: true,
      rentalType: true,
      finalAmount: true,
      commissionRate: true,
      commissionAmount: true,
      dispatchedAt: true,
      supplierVehicleNote: true,
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
  },
};

function inclusiveEnd(value) {
  const end = new Date(value);
  if (!String(value).includes('T')) end.setHours(23, 59, 59, 999);
  return end;
}

function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

async function getScopedSettlement(id, supplierId) {
  const settlement = await prisma.supplierSettlement.findUnique({
    where: { id: Number(id) },
    include: settlementInclude,
  });
  if (!settlement) throw new NotFoundError('Supplier settlement');
  if (supplierId != null && settlement.supplierId !== Number(supplierId)) {
    throw new ForbiddenError('Kỳ payout không thuộc nhà cung cấp của bạn');
  }
  // White-label: CarGoGo's margin is internal. When the settlement is read
  // through the supplier portal (supplierId scope present), strip commission so
  // the supplier only sees trip revenue + their payout, never the cut CarGoGo took.
  if (supplierId != null) return stripCommission(settlement);
  return settlement;
}

/**
 * Remove margin fields for supplier-facing reads. CarGoGo's cut must stay
 * internal, so we drop not just the commission columns but also the trip GROSS
 * (`totalFinalAmount` / per-booking `finalAmount`): with `supplierPayout` shown,
 * gross would let the supplier back out commission = gross − payout. The
 * supplier only ever sees what they are owed (`supplierPayout`), never CarGoGo's
 * revenue on the trip.
 */
function stripCommission(settlement) {
  // eslint-disable-next-line no-unused-vars
  const { totalCommissionAmount, totalFinalAmount, ...rest } = settlement;
  return {
    ...rest,
    bookings: (settlement.bookings ?? []).map(
      // eslint-disable-next-line no-unused-vars
      ({ commissionRate, commissionAmount, finalAmount, ...booking }) => booking
    ),
  };
}

export const supplierSettlementService = {
  async create(supplierId, { periodStart, periodEnd, note } = {}) {
    const start = new Date(periodStart);
    const end = inclusiveEnd(periodEnd);
    if (
      !periodStart ||
      !periodEnd ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      throw new UnprocessableError('Kỳ payout không hợp lệ', 'INVALID_PERIOD');
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: Number(supplierId) },
    });
    if (!supplier) throw new NotFoundError('Supplier');

    const existing = await prisma.supplierSettlement.findMany({
      where: { supplierId: supplier.id },
      select: { periodStart: true, periodEnd: true },
    });
    if (existing.some((item) => periodsOverlap(start, end, item.periodStart, item.periodEnd))) {
      throw new ConflictError(
        'Kỳ payout bị trùng với kỳ đã tồn tại',
        'SUPPLIER_SETTLEMENT_PERIOD_OVERLAP'
      );
    }

    const bookings = await prisma.corporateBooking.findMany({
      where: {
        supplierId: supplier.id,
        status: 'SETTLED',
        supplierSettlementId: null,
        finalAmount: { not: null },
        commissionAmount: { not: null },
        completedAt: { gte: start, lte: end },
      },
      select: { id: true, finalAmount: true, commissionAmount: true },
    });
    if (!bookings.length) {
      throw new UnprocessableError(
        'Không có chuyến SETTLED đủ điều kiện trong kỳ',
        'NO_ELIGIBLE_BOOKINGS'
      );
    }

    const totalFinalAmount = Math.round(
      bookings.reduce((sum, booking) => sum + Number(booking.finalAmount || 0), 0)
    );
    const totalCommissionAmount = Math.round(
      bookings.reduce((sum, booking) => sum + Number(booking.commissionAmount || 0), 0)
    );
    const supplierPayout = Math.round(totalFinalAmount - totalCommissionAmount);

    const created = await prisma.$transaction(async (tx) => {
      const settlement = await tx.supplierSettlement.create({
        data: {
          supplierId: supplier.id,
          periodStart: start,
          periodEnd: end,
          totalFinalAmount,
          totalCommissionAmount,
          supplierPayout,
          note: note || null,
        },
      });
      const attached = await tx.corporateBooking.updateMany({
        where: {
          id: { in: bookings.map((booking) => booking.id) },
          supplierSettlementId: null,
        },
        data: { supplierSettlementId: settlement.id },
      });
      if (attached.count !== bookings.length) {
        throw new ConflictError(
          'Một số chuyến vừa được đưa vào kỳ payout khác',
          'BOOKING_ALREADY_IN_SUPPLIER_SETTLEMENT'
        );
      }
      return settlement;
    });

    await notificationService.notifySupplierAdmins(supplier.id, {
      type: 'SUPPLIER_SETTLEMENT_CREATED',
      title: 'Có kỳ payout mới cần nộp hồ sơ',
      body: `Kỳ payout #${created.id}: cần nộp hóa đơn GTGT, bảng kê và lệnh điều xe.`,
      link: `/supplier/settlements/${created.id}`,
    });

    return this.getById(created.id);
  },

  async listBySupplier(supplierId, { status, page = 1, size = 20 } = {}) {
    const where = { supplierId: Number(supplierId) };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.supplierSettlement.findMany({
        where,
        include: { _count: { select: { bookings: true } } },
        orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.supplierSettlement.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id, supplierId) {
    return getScopedSettlement(id, supplierId);
  },

  async submitDocuments(membership, id, documents) {
    if (!membership.isAdmin) {
      throw new ForbiddenError('Chỉ Supplier Admin được nộp hồ sơ payout');
    }
    const settlement = await getScopedSettlement(id, membership.supplierId);
    if (!['PENDING_DOCUMENTS', 'DOCUMENTS_REJECTED'].includes(settlement.status)) {
      throw new ConflictError(
        `Không thể nộp hồ sơ từ trạng thái ${settlement.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.supplierSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'DOCUMENTS_SUBMITTED',
        vatInvoiceRef: documents.vatInvoiceRef,
        vatInvoiceUrl: documents.vatInvoiceUrl,
        statementUrl: documents.statementUrl,
        dispatchRecordsUrl: documents.dispatchRecordsUrl,
        supportingDocumentsUrl: documents.supportingDocumentsUrl || null,
        note: documents.note ?? settlement.note,
        rejectionReason: null,
        submittedAt: new Date(),
        verifiedAt: null,
        verifiedBy: null,
      },
      include: settlementInclude,
    });

    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'SUPPLIER_SETTLEMENT_DOCUMENTS_SUBMITTED',
      title: 'Supplier đã nộp hồ sơ payout',
      body: `Kỳ payout #${updated.id} của ${updated.supplier.name} đang chờ xác minh.`,
      link: `/admin/suppliers/${updated.supplierId}`,
    });
    // Supplier-facing return — strip CarGoGo's margin.
    return stripCommission(updated);
  },

  async verify(id, adminUserId) {
    const settlement = await getScopedSettlement(id);
    if (settlement.status !== 'DOCUMENTS_SUBMITTED') {
      throw new ConflictError(
        `Chỉ xác minh từ DOCUMENTS_SUBMITTED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    if (
      !settlement.vatInvoiceRef ||
      !settlement.vatInvoiceUrl ||
      !settlement.statementUrl ||
      !settlement.dispatchRecordsUrl
    ) {
      throw new UnprocessableError(
        'Thiếu hóa đơn GTGT, bảng kê hoặc lệnh điều xe',
        'SUPPLIER_SETTLEMENT_DOCUMENTS_INCOMPLETE'
      );
    }

    const updated = await prisma.supplierSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: Number(adminUserId),
        rejectionReason: null,
      },
      include: settlementInclude,
    });
    await notificationService.notifySupplierAdmins(updated.supplierId, {
      type: 'SUPPLIER_SETTLEMENT_VERIFIED',
      title: 'Hồ sơ payout đã được duyệt',
      body: `Kỳ payout #${updated.id} đã đủ điều kiện thanh toán.`,
      link: `/supplier/settlements/${updated.id}`,
    });
    return updated;
  },

  async rejectDocuments(id, { reason }, adminUserId) {
    const settlement = await getScopedSettlement(id);
    if (settlement.status !== 'DOCUMENTS_SUBMITTED') {
      throw new ConflictError(
        `Chỉ từ chối từ DOCUMENTS_SUBMITTED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    const updated = await prisma.supplierSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'DOCUMENTS_REJECTED',
        rejectionReason: reason,
        verifiedAt: null,
        verifiedBy: Number(adminUserId),
      },
      include: settlementInclude,
    });
    await notificationService.notifySupplierAdmins(updated.supplierId, {
      type: 'SUPPLIER_SETTLEMENT_DOCUMENTS_REJECTED',
      title: 'Hồ sơ payout cần bổ sung',
      body: `Kỳ payout #${updated.id}: ${reason}`,
      link: `/supplier/settlements/${updated.id}`,
    });
    return updated;
  },

  async markPaid(id, { paymentReference }, adminUserId) {
    const settlement = await getScopedSettlement(id);
    if (settlement.status !== 'VERIFIED') {
      throw new ConflictError(
        `Chỉ thanh toán từ VERIFIED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    const updated = await prisma.supplierSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAID',
        paymentReference,
        paidAt: new Date(),
        paidBy: Number(adminUserId),
      },
      include: settlementInclude,
    });
    await notificationService.notifySupplierAdmins(updated.supplierId, {
      type: 'SUPPLIER_SETTLEMENT_PAID',
      title: 'CarGoGo đã thanh toán payout',
      body: `Kỳ payout #${updated.id} đã thanh toán, mã ${paymentReference}.`,
      link: `/supplier/settlements/${updated.id}`,
    });
    return updated;
  },
};

export default supplierSettlementService;
