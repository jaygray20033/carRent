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
import { sendEmail } from '../../../integrations/email.js';
import { notificationService } from '../../../services/notificationService.js';
import { computeCommissionAmount } from '../admin/suppliers/dispatch.service.js';
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

        // Snapshot OtoRent's commission per supplier-fulfilled booking.
        // commissionAmount = round(finalAmount × commissionRate) — integer VND.
        for (const b of inPeriod) {
          if (b.commissionRate == null || b.finalAmount == null) continue;
          const amount = computeCommissionAmount(b.finalAmount, b.commissionRate);
          if (amount == null) continue;
          await tx.corporateBooking.update({
            where: { id: b.id },
            data: { commissionAmount: amount },
          });
        }
      }

      return created;
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
          subject: `Bảng kê quyết toán #${updated.id} — ${updated.corporate?.name || 'OtoRent B2B'}`,
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
          link: `/corporate/settlements/${updated.id}`,
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

  async markPaid(id, { invoiceRef } = {}) {
    const settlement = await this.getById(id);
    if (settlement.status !== 'CONFIRMED') {
      throw new ConflictError(
        `Chỉ mark-paid từ CONFIRMED (hiện: ${settlement.status})`,
        'INVALID_STATUS_TRANSITION'
      );
    }
    return prisma.corporateSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAID',
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
};

export default settlementService;
