// src/api/v1/admin/reports/adminReports.service.js
// Day 35 (UC-59) — admin reports.
//   - revenue      : SUCCESS payments aggregated by day|month + method breakdown
//   - booking      : booking counts grouped by status
//   - topVehicles  : most-booked vehicles (rolled up with model/brand names)
//
// Range defaults to the trailing 30 days when from/to are omitted. `from` is
// snapped to 00:00:00 and `to` to 23:59:59.999 so both endpoints are inclusive
// (mirrors the dashboard service).
import prisma from '../../../../config/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalise the requested window: default last 30 days, inclusive endpoints. */
const resolveRange = (from, to) => {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY_MS);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

/** yyyy-mm-dd in local time. */
const dayKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** yyyy-mm in local time. */
const monthKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const adminReportsService = {
  /**
   * UC-59 — Revenue report. SUCCESS payments in range aggregated into a time
   * series (per day or per month, gap-filled) plus a breakdown by payment
   * method and the grand total.
   */
  async revenue({ from, to, group = 'day' }) {
    const { start, end } = resolveRange(from, to);
    const byMonth = group === 'month';

    const [rows, methodGroups, totalAgg] = await Promise.all([
      // Time-bucketed revenue for the series (raw for DATE()/DATE_FORMAT bucketing).
      byMonth
        ? prisma.$queryRaw`
            SELECT DATE_FORMAT(paid_at, '%Y-%m') AS bucket, SUM(amount) AS revenue, COUNT(*) AS cnt
            FROM payments
            WHERE status = 'SUCCESS' AND paid_at BETWEEN ${start} AND ${end}
            GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
            ORDER BY bucket ASC
          `
        : prisma.$queryRaw`
            SELECT DATE(paid_at) AS bucket, SUM(amount) AS revenue, COUNT(*) AS cnt
            FROM payments
            WHERE status = 'SUCCESS' AND paid_at BETWEEN ${start} AND ${end}
            GROUP BY DATE(paid_at)
            ORDER BY bucket ASC
          `,
      // Breakdown by payment method.
      prisma.payment.groupBy({
        by: ['method'],
        _sum: { amount: true },
        _count: { _all: true },
        where: { status: 'SUCCESS', paidAt: { gte: start, lte: end } },
      }),
      // Grand total.
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { status: 'SUCCESS', paidAt: { gte: start, lte: end } },
      }),
    ]);

    // ── Time series, gap-filled ─────────────────────────────────────────
    const keyOf = byMonth ? monthKey : dayKey;
    const seriesMap = new Map(
      rows.map((r) => [
        byMonth ? String(r.bucket) : keyOf(new Date(r.bucket)),
        { revenue: Number(r.revenue) || 0, count: Number(r.cnt) || 0 },
      ])
    );

    const series = [];
    if (byMonth) {
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= last) {
        const key = monthKey(cursor);
        const hit = seriesMap.get(key);
        series.push({ period: key, revenue: hit?.revenue ?? 0, count: hit?.count ?? 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
        const key = dayKey(new Date(t));
        const hit = seriesMap.get(key);
        series.push({ period: key, revenue: hit?.revenue ?? 0, count: hit?.count ?? 0 });
      }
    }

    const byMethod = methodGroups
      .map((g) => ({
        method: g.method,
        revenue: g._sum.amount ?? 0,
        count: g._count._all,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      group: byMonth ? 'month' : 'day',
      total: totalAgg._sum.amount ?? 0,
      count: totalAgg._count._all,
      byMethod,
      series,
    };
  },

  /** UC-59 — Booking report: counts grouped by status within the range. */
  async booking({ from, to }) {
    const { start, end } = resolveRange(from, to);
    const bookingRange = { createdAt: { gte: start, lte: end } };

    const [groups, total] = await Promise.all([
      prisma.booking.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: bookingRange,
      }),
      prisma.booking.count({ where: bookingRange }),
    ]);

    const byStatus = groups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      total,
      byStatus,
    };
  },

  /**
   * UC-59 — Top vehicles by booking count in range, rolled up with model/brand
   * names. Limited to `limit` (default 10, capped at 50).
   */
  async topVehicles({ from, to, limit = 10 }) {
    const { start, end } = resolveRange(from, to);
    const take = Math.min(Math.max(1, Number(limit) || 10), 50);

    const groups = await prisma.booking.groupBy({
      by: ['vehicleId'],
      _count: { _all: true },
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { _count: { vehicleId: 'desc' } },
      take,
    });

    if (groups.length === 0) {
      return { range: { from: start.toISOString(), to: end.toISOString() }, items: [] };
    }

    const vehicleIds = groups.map((g) => g.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        name: true,
        licensePlate: true,
        model: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
    const byId = new Map(vehicles.map((v) => [v.id, v]));

    const items = groups.map((g) => {
      const v = byId.get(g.vehicleId);
      return {
        vehicleId: g.vehicleId,
        name: v?.name ?? 'Không rõ',
        licensePlate: v?.licensePlate ?? null,
        modelName: v?.model?.name ?? null,
        brandName: v?.brand?.name ?? null,
        bookings: g._count._all,
      };
    });

    return { range: { from: start.toISOString(), to: end.toISOString() }, items };
  },
};

export default adminReportsService;
