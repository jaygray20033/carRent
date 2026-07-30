// src/api/v1/corporate/settlement.service.js
// B2B Day 5 — UC-69/70 corporate settlements.
import prisma from '../../../config/db.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';
import {
  filterBookingsForPeriod,
  calculateSettlementTotals,
} from '../../../services/settlementCalculator.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';
import { buildSettlementPdf } from '../../../services/settlementPdf.js';
import { buildSettlementQr } from '../../../services/vietqr.js';
import { sendEmail } from '../../../integrations/email.js';
import { notificationService } from '../../../services/notificationService.js';
import { dispatchService } from '../admin/suppliers/dispatch.service.js';
import logger from '../../../config/logger.js';
import env from '../../../config/env.js';

const settlementInclude = {
  corporate: {
    select: {
      id: true,
      name: true,
      taxCode: true,
      contractRef: true,
      contactEmail: true,
      contactName: true,
      contactPhone: true,
      address: true,
    },
  },
  bookings: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          department: true,
          user: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      },
      expenses: true,
      bookingVAS: { include: { vas: true } },
    },
    orderBy: { pickupAt: 'asc' },
  },
};

function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

function enrichBookings(bookings) {
  return (bookings || []).map((b) => {
    const summary = buildCostSummary({
      basePrice: b.basePrice,
      expenses: b.expenses || [],
      vasLines: b.bookingVAS || [],
    });
    return { ...b, _line: summary };
  });
}

export const settlementService = {
  async create(corporateId, { periodStart, periodEnd }) {
    if (!periodStart || !periodEnd) {
      throw new UnprocessableError('Cần periodStart và periodEnd', 'PERIOD_REQUIRED');
    }
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new UnprocessableError('Kỳ quyết toán không hợp lệ', 'INVALID_PERIOD');
    }

    const corporate = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!corporate) throw new NotFoundError('Corporate client');

    // Overlap check against existing settlements of this company
    const existing = await prisma.corporateSettlement.findMany({
      where: { corporateId: Number(corporateId) },
    });
    for (const s of existing) {
      // Quick single-booking settlements use an instant period (start === end) and
      // target a specific booking, so they never conflict with a monthly period.
      if (new Date(s.periodStart).getTime() === new Date(s.periodEnd).getTime()) continue;
      if (periodsOverlap(start, end, s.periodStart, s.periodEnd)) {
        throw new ConflictError(
          'Kỳ quyết toán bị trùng với settlement đã tồn tại',
          'SETTLEMENT_PERIOD_OVERLAP'
        );
      }
    }

    // Pull candidate bookings (CONFIRMED) for the company; filter by period in service.
    const allConfirmed = await prisma.corporateBooking.findMany({
      where: {
        corporateId: Number(corporateId),
        status: 'CONFIRMED',
        settlementId: null,
      },
      include: { expenses: true, bookingVAS: { include: { vas: true } } },
    });
    const inPeriod = filterBookingsForPeriod(allConfirmed, start, end);
    const totals = calculateSettlementTotals(inPeriod);

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.corporateSettlement.create({
        data: {
          corporateId: Number(corporateId),
          periodStart: start,
          periodEnd: end,
          totalBaseAmount: totals.totalBaseAmount,
          totalExpenses: totals.totalExpenses,
          totalVat: totals.totalVat,
          totalAmount: totals.totalAmount,
          status: 'DRAFT',
        },
      });

      if (inPeriod.length) {
        await tx.corporateBooking.updateMany({
          where: { id: { in: inPeriod.map((b) => b.id) } },
          data: { settlementId: created.id, status: 'SETTLED' },
        });

        await dispatchService.applyCommissionOnSettle(
          inPeriod.map((booking) => booking.id),
          tx
        );
      }

      return created;
    });

    return this.getById(settlement.id);
  },

  // Quick single-booking settlement — bypasses the period sweep. Settles exactly
  // one CONFIRMED booking (settlementId:null) into its own DRAFT so an admin can
  // move straight to payment without waiting for a monthly close. Uses an instant
  // period [completedAt, completedAt] so it never blocks a later monthly settlement.
  async createForBooking(bookingId) {
    const booking = await prisma.corporateBooking.findUnique({
      where: { id: Number(bookingId) },
      include: { expenses: true, bookingVAS: { include: { vas: true } } },
    });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictError(
        `Chỉ quyết toán booking đã CONFIRMED (hiện: ${booking.status})`,
        'BOOKING_NOT_CONFIRMED'
      );
    }
    if (booking.settlementId) {
      throw new ConflictError('Booking đã thuộc một bảng kê', 'BOOKING_ALREADY_SETTLED');
    }

    const at = new Date(booking.completedAt || booking.pickupAt);
    const totals = calculateSettlementTotals([booking]);

    const settlement = await prisma.$transaction(async (tx) => {
      const createdSettlement = await tx.corporateSettlement.create({
        data: {
          corporateId: booking.corporateId,
          periodStart: at,
          periodEnd: at,
          totalBaseAmount: totals.totalBaseAmount,
          totalExpenses: totals.totalExpenses,
          totalVat: totals.totalVat,
          totalAmount: totals.totalAmount,
          status: 'DRAFT',
        },
      });

      await tx.corporateBooking.update({
        where: { id: booking.id },
        data: { settlementId: createdSettlement.id, status: 'SETTLED' },
      });

      await dispatchService.applyCommissionOnSettle([booking.id], tx);

      return createdSettlement;
    });

    return this.getById(settlement.id);
  },

  async listByCorporate(corporateId, { status, page = 1, size = 20 } = {}) {
    const where = { corporateId: Number(corporateId) };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.corporateSettlement.findMany({
        where,
        orderBy: [{ periodStart: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: {
          _count: { select: { bookings: true } },
        },
      }),
      prisma.corporateSettlement.count({ where }),
    ]);
    return { items, total, page, size };
  },

  // Global admin list across all companies — used by the "Xác nhận thanh toán"
  // queue so OtoRent staff see every settlement a company declared paid
  // (PAYMENT_DECLARED) without drilling into each client. Newest declaration first.
  async listAll({ status, page = 1, size = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.corporateSettlement.findMany({
        where,
        orderBy: [{ paymentDeclaredAt: 'desc' }, { periodStart: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: {
          corporate: { select: { id: true, name: true, taxCode: true, contactName: true } },
          _count: { select: { bookings: true } },
        },
      }),
      prisma.corporateSettlement.count({ where }),
    ]);
    return { items, total, page, size };
  },

  async getById(id) {
    const settlement = await prisma.corporateSettlement.findUnique({
      where: { id: Number(id) },
      include: settlementInclude,
    });
    if (!settlement) throw new NotFoundError('Settlement');
    return {
      ...settlement,
      bookings: enrichBookings(settlement.bookings),
    };
  },

  async send(id) {
    const settlement = await this.getById(id);
    if (settlement.status !== 'DRAFT') {
      throw new ConflictError(
        `Chỉ send từ DRAFT (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: { status: 'SENT' },
      include: settlementInclude,
    });

    // Email PDF to corporate contact
    const to = updated.corporate?.contactEmail;
    let emailResult = { sent: false };
    try {
      const pdf = await buildSettlementPdf({
        settlement: updated,
        corporate: updated.corporate,
        bookings: enrichBookings(updated.bookings),
      });
      if (to) {
        emailResult = await sendEmail({
          to,
          template: 'otp', // reuse simple template body
          subject: `Bảng kê quyết toán #${updated.id} — ${updated.corporate?.name || 'CarGoGo B2B'}`,
          data: {
            code: String(updated.id),
            purpose: `Bảng kê kỳ ${new Date(updated.periodStart).toISOString().slice(0, 10)} — ${new Date(updated.periodEnd).toISOString().slice(0, 10)}. Tổng: ${updated.totalAmount} VND. Xem: ${env.FRONTEND_URL}/corporate/settlements/${updated.id}`,
            ttlMinutes: 0,
          },
          attachments: [
            {
              filename: `settlement-${updated.id}.pdf`,
              content: pdf,
              contentType: 'application/pdf',
            },
          ],
        });
      }
    } catch (err) {
      logger.warn(`Settlement email failed: ${err.message}`);
    }

    // Notify corporate admins in-app
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
      admins.map((a) =>
        notificationService.notify({
          userId: a.userId,
          type: 'CORPORATE_SETTLEMENT_SENT',
          title: 'Có bảng kê quyết toán mới',
          body: `Settlement #${updated.id} cần xác nhận.`,
          link: `/enterprise/settlements`,
        })
      )
    );

    return { settlement: updated, email: emailResult };
  },

  async confirmByCorporate(membership, id) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin xác nhận');
    const settlement = await this.getById(id);
    if (settlement.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Settlement không thuộc công ty của bạn');
    }
    if (settlement.status !== 'SENT' && settlement.status !== 'DISPUTED') {
      throw new ConflictError(
        `Chỉ confirm từ SENT/DISPUTED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
      include: settlementInclude,
    });
  },

  async disputeByCorporate(membership, id, { note }) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin dispute');
    if (!note || !String(note).trim()) {
      throw new UnprocessableError('Vui lòng nhập lý do dispute', 'NOTE_REQUIRED');
    }
    const settlement = await this.getById(id);
    if (settlement.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Settlement không thuộc công ty của bạn');
    }
    if (settlement.status !== 'SENT') {
      throw new ConflictError(
        `Chỉ dispute từ SENT (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: { status: 'DISPUTED', note: String(note).trim() },
      include: settlementInclude,
    });
  },

  // Manual bank-transfer flow — the corporate admin declares "đã chuyển khoản".
  // This ALWAYS alerts OtoRent staff (even before/without a proof image), because
  // the payer might lose connectivity right after transferring. The proof image
  // is attached separately (attachProof) and is best-effort. OtoRent still owns
  // the final PAID flip via markPaid once the money is confirmed received.
  async declareByCorporate(membership, id) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin xác nhận thanh toán');
    const settlement = await this.getById(id);
    if (settlement.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Settlement không thuộc công ty của bạn');
    }
    if (!['SENT', 'CONFIRMED', 'DISPUTED'].includes(settlement.status)) {
      throw new ConflictError(
        `Chỉ báo đã thanh toán khi bảng kê đã gửi và chưa thanh toán (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAYMENT_DECLARED',
        paymentDeclaredAt: new Date(),
        paymentMethod: 'BANK_TRANSFER',
      },
      include: settlementInclude,
    });

    // Alert OtoRent staff so they can reconcile the incoming transfer — fires
    // regardless of whether a proof image is uploaded (best-effort, never throws).
    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'CORPORATE_SETTLEMENT_PAYMENT_DECLARED',
      title: 'Doanh nghiệp báo đã thanh toán',
      body: `${updated.corporate?.name || 'Doanh nghiệp'} báo đã chuyển khoản bảng kê #${updated.id} (${Math.round(Number(updated.totalAmount || 0)).toLocaleString('vi-VN')} VND). Vui lòng kiểm tra và xác nhận.`,
      link: `/admin/corporate/settlements/${updated.id}`,
    });

    return updated;
  },

  // Ownership + status guard for proof upload — call BEFORE storing the file so an
  // unauthorized/invalid request never leaves an orphaned upload behind.
  async assertCanAttachProof(membership, id) {
    if (!membership.isAdmin) throw new ForbiddenError('Chỉ Corporate Admin gửi ảnh thanh toán');
    const settlement = await this.getById(id);
    if (settlement.corporateId !== membership.corporateId) {
      throw new ForbiddenError('Settlement không thuộc công ty của bạn');
    }
    if (!['PAYMENT_DECLARED', 'CONFIRMED', 'SENT', 'DISPUTED'].includes(settlement.status)) {
      throw new ConflictError(
        `Không thể gửi ảnh thanh toán ở trạng thái này (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return settlement;
  },

  // Attach a bank-transfer proof image to a settlement the company already
  // declared paid. Best-effort follow-up to declareByCorporate: the URL is stored
  // and OtoRent staff are pinged again so the proof surfaces in their queue.
  async attachProof(membership, id, proofUrl) {
    const settlement = await this.assertCanAttachProof(membership, id);

    const updated = await prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: { paymentProofUrl: proofUrl },
      include: settlementInclude,
    });

    await notificationService.notifyRoles({
      roles: ['ADMIN', 'OPERATOR'],
      type: 'CORPORATE_SETTLEMENT_PROOF_UPLOADED',
      title: 'Doanh nghiệp đã gửi ảnh thanh toán',
      body: `${updated.corporate?.name || 'Doanh nghiệp'} đã gửi ảnh chuyển khoản cho bảng kê #${updated.id}.`,
      link: `/admin/corporate/settlements/${updated.id}`,
    });

    return updated;
  },

  async markPaid(id, { invoiceRef } = {}) {
    const settlement = await this.getById(id);
    if (!['CONFIRMED', 'PAYMENT_DECLARED'].includes(settlement.status)) {
      throw new ConflictError(
        `Chỉ mark-paid từ CONFIRMED/PAYMENT_DECLARED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAID',
        paidAt: settlement.paidAt || new Date(),
        invoiceRef: invoiceRef || settlement.invoiceRef,
      },
      include: settlementInclude,
    });
  },

  async exportPdf(id) {
    const settlement = await this.getById(id);
    const pdf = await buildSettlementPdf({
      settlement,
      corporate: settlement.corporate,
      bookings: settlement.bookings,
    });
    return { pdf, settlement };
  },

  // VietQR for a settlement — only meaningful once the company can act on it
  // (SENT onward) and before it's paid. DRAFT is CarGoGo-internal; PAID is done.
  async getQr(id) {
    const settlement = await this.getById(id);
    if (!['SENT', 'CONFIRMED', 'DISPUTED'].includes(settlement.status)) {
      throw new ConflictError(
        `Chỉ tạo QR khi bảng kê đã gửi và chưa thanh toán (hiện: ${settlement.status})`,
        'INVALID_STATUS_FOR_QR'
      );
    }
    return { settlement, qr: buildSettlementQr(settlement) };
  },

  // Auto-reconcile an incoming bank transfer (SePay webhook) to a settlement.
  // Idempotent: a second callback for a settlement already PAID (or already
  // stamped with this txnRef) is a no-op. Flips SENT/CONFIRMED → PAID only.
  // Returns { settlement, matched } — matched:false means "acknowledged but not
  // applied" (unknown id, wrong amount, non-payable status) so the webhook can
  // still 200 and SePay won't retry forever.
  async reconcileByTransfer({ settlementId, amount, txnRef }) {
    if (!settlementId) return { settlement: null, matched: false, reason: 'NO_SETTLEMENT_ID' };

    const settlement = await prisma.corporateSettlement.findUnique({
      where: { id: Number(settlementId) },
    });
    if (!settlement) return { settlement: null, matched: false, reason: 'NOT_FOUND' };

    // Idempotency — already settled (possibly by this very transfer).
    if (settlement.status === 'PAID') {
      logger.info(`SePay reconcile ignored (already PAID): settlement=${settlement.id}`);
      return { settlement, matched: true, reason: 'ALREADY_PAID' };
    }

    if (!['SENT', 'CONFIRMED'].includes(settlement.status)) {
      logger.warn(
        `SePay reconcile skipped (status=${settlement.status}): settlement=${settlement.id}`
      );
      return { settlement, matched: false, reason: 'NOT_PAYABLE' };
    }

    // Amount must match the billed total exactly (integer VND).
    const expected = Math.round(Number(settlement.totalAmount || 0));
    const received = Math.round(Number(amount || 0));
    if (received !== expected) {
      logger.warn(
        `SePay reconcile amount mismatch: settlement=${settlement.id} expected=${expected} received=${received}`
      );
      return { settlement, matched: false, reason: 'AMOUNT_MISMATCH' };
    }

    const updated = await prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: 'BANK_TRANSFER',
        paymentTxnRef: txnRef ? String(txnRef) : undefined,
      },
      include: settlementInclude,
    });
    logger.info(`SePay reconcile OK: settlement=${settlement.id} txnRef=${txnRef}`);
    return { settlement: updated, matched: true, reason: 'PAID' };
  },
};

export default settlementService;
