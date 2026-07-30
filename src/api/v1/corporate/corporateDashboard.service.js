// src/api/v1/corporate/corporateDashboard.service.js
// B2B Day 6 — UC-71 corporate dashboard + CSV trips report.
import { stringify } from 'csv-stringify/sync';
import prisma from '../../../config/db.js';
import { ForbiddenError, NotFoundError } from '../../../utils/apiError.js';
import { buildCostSummary } from '../../../services/tripExpenseCalculator.js';

const UTF8_BOM = String.fromCharCode(0xfeff);

function monthRange(monthStr) {
  // monthStr = "YYYY-MM" or null → current month
  let y;
  let m;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    [y, m] = monthStr.split('-').map(Number);
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive
  return { y, m, start, end, month: `${y}-${String(m).padStart(2, '0')}` };
}

function bookingAmount(b) {
  if (b.finalAmount != null) return Math.round(Number(b.finalAmount));
  const s = buildCostSummary({
    basePrice: b.basePrice,
    expenses: b.expenses || [],
    vasLines: b.bookingVAS || [],
  });
  return s.total;
}

export const corporateDashboardService = {
  async getDashboard(corporateId, { month } = {}) {
    const corporate = await prisma.corporateClient.findUnique({
      where: { id: Number(corporateId) },
    });
    if (!corporate) throw new NotFoundError('Corporate client');

    const { start, end, month: monthKey } = monthRange(month);

    const monthBookings = await prisma.corporateBooking.findMany({
      where: {
        corporateId: Number(corporateId),
        pickupAt: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
      include: {
        expenses: true,
        bookingVAS: { include: { vas: true } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    // KPIs for current (or requested) month
    const totalTrips = monthBookings.length;
    let totalAmount = 0;
    let pendingConfirm = 0;
    let pendingApproval = 0;
    const byEmp = new Map();
    const expenseBreakdown = {};
    const weekly = new Map(); // week index → amount

    for (const b of monthBookings) {
      const amt = bookingAmount(b);
      totalAmount += amt;
      if (b.status === 'PENDING_CONFIRM') pendingConfirm += 1;
      if (b.status === 'PENDING') pendingApproval += 1;

      // by employee
      const key = b.employeeId;
      const row = byEmp.get(key) || {
        employeeId: b.employeeId,
        name: b.employee?.user?.fullName || b.employee?.employeeCode || `#${b.employeeId}`,
        trips: 0,
        amount: 0,
      };
      row.trips += 1;
      row.amount += amt;
      byEmp.set(key, row);

      // expense breakdown (approved only)
      for (const e of b.expenses || []) {
        if (e.approvedByAdmin !== true) continue;
        expenseBreakdown[e.type] = (expenseBreakdown[e.type] || 0) + Math.round(Number(e.amount));
      }

      // weekly trend (ISO week-ish: day-of-month bucket by week of month)
      const d = new Date(b.pickupAt);
      const weekOfMonth = Math.ceil(d.getUTCDate() / 7);
      const wk = `W${weekOfMonth}`;
      weekly.set(wk, (weekly.get(wk) || 0) + amt);
    }

    const tripsByEmployee = [...byEmp.values()].sort((a, b) => b.trips - a.trips || b.amount - a.amount);

    // Monthly trend last 6 months
    const monthlyTrend = [];
    const base = new Date(start);
    for (let i = 5; i >= 0; i -= 1) {
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      const dtEnd = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
      const label = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
       
      const rows = await prisma.corporateBooking.findMany({
        where: {
          corporateId: Number(corporateId),
          pickupAt: { gte: dt, lt: dtEnd },
          status: { not: 'CANCELLED' },
        },
        include: { expenses: true, bookingVAS: { include: { vas: true } } },
      });
      monthlyTrend.push({
        month: label,
        trips: rows.length,
        amount: rows.reduce((s, b) => s + bookingAmount(b), 0),
      });
    }

    return {
      corporate: { id: corporate.id, name: corporate.name, taxCode: corporate.taxCode },
      month: monthKey,
      currentMonth: {
        totalTrips,
        totalAmount,
        pendingConfirm,
        pendingApproval,
      },
      tripsByEmployee,
      expenseBreakdown,
      weeklyTrend: [...weekly.entries()].map(([week, amount]) => ({ week, amount })),
      monthlyTrend,
    };
  },

  async exportTripsCsv(corporateId, { month, employeeId, status } = {}) {
    const { start, end, month: monthKey } = monthRange(month);
    const where = {
      corporateId: Number(corporateId),
      pickupAt: { gte: start, lt: end },
    };
    if (employeeId) where.employeeId = Number(employeeId);
    if (status) where.status = status;

    const bookings = await prisma.corporateBooking.findMany({
      where,
      include: {
        expenses: true,
        bookingVAS: { include: { vas: true } },
        employee: {
          select: {
            employeeCode: true,
            user: { select: { fullName: true, phone: true } },
          },
        },
      },
      orderBy: { pickupAt: 'asc' },
    });

    const rows = [
      [
        'ID',
        'Ngày đón',
        'Nhân viên',
        'Mã NV',
        'Loại xe',
        'Thuê',
        'Điểm đi',
        'Điểm đến',
        'Km',
        'Base',
        'Chi phí PS',
        'VAT',
        'Tổng',
        'Trạng thái',
      ],
      ...bookings.map((b) => {
        const s = buildCostSummary({
          basePrice: b.basePrice,
          expenses: b.expenses || [],
          vasLines: b.bookingVAS || [],
        });
        return [
          b.id,
          new Date(b.pickupAt).toISOString(),
          b.employee?.user?.fullName || '',
          b.employee?.employeeCode || '',
          b.vehicleType,
          b.rentalType,
          b.pickupAddress,
          b.dropoffAddress,
          b.actualKm ?? b.estimatedKm ?? '',
          s.basePrice,
          s.expenseTotal,
          s.vat10,
          s.total,
          b.status,
        ];
      }),
    ];

    const csv = stringify(rows);
    return {
      body: `${UTF8_BOM}${csv}`,
      filename: `corporate-trips-${monthKey}.csv`,
      count: bookings.length,
    };
  },

  /** Guard: only corporate admin (or CarGoGo admin path). */
  assertAdmin(membership) {
    if (!membership?.isAdmin) {
      throw new ForbiddenError('Chỉ Corporate Admin được xem dashboard');
    }
  },
};

export default corporateDashboardService;
