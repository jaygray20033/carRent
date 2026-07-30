// src/api/v1/admin/dashboard/adminDashboard.service.js
// Admin dashboard KPIs (UC-52).
//   - totalRevenue     : sum of SUCCESS payments paid in range
//   - bookingsByStatus : booking counts grouped by status (created in range)
//   - newUsers         : users registered in range
//   - topModels        : top 5 vehicle models by booking count
//   - revenueByDay      : daily SUCCESS-payment totals, gap-filled for charting
//   - cancelRate        : cancelled / total bookings created in range
//
// Range defaults to the trailing 30 days when from/to are omitted. `from` is
// snapped to 00:00:00 and `to` to 23:59:59.999 so both endpoints are inclusive.
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

/** yyyy-mm-dd in local time (matches DATE() bucketing below). */
const dayKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const adminDashboardService = {
  /** UC-52 — aggregate all dashboard KPIs for the given window. */
  async getKpis({ from, to }) {
    const { start, end } = resolveRange(from, to);

    const paymentRange = { paidAt: { gte: start, lte: end } };
    const bookingRange = { createdAt: { gte: start, lte: end } };

    const [
      revenueAgg,
      statusGroups,
      newUsers,
      totalBookings,
      cancelledBookings,
      vehicleGroups,
      dailyRows,
    ] = await Promise.all([
      // Total revenue — sum of SUCCESS payments in range.
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', ...paymentRange },
      }),
      // Bookings grouped by status (created in range).
      prisma.booking.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: bookingRange,
      }),
      // New users in range.
      prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
      // Total bookings in range (denominator for cancel rate).
      prisma.booking.count({ where: bookingRange }),
      // Cancelled bookings in range (numerator for cancel rate).
      prisma.booking.count({ where: { ...bookingRange, status: 'CANCELLED' } }),
      // Bookings grouped by vehicle → rolled up to model below.
      prisma.booking.groupBy({
        by: ['vehicleId'],
        _count: { _all: true },
        where: bookingRange,
      }),
      // Daily SUCCESS-payment revenue for the chart (raw for DATE() bucketing).
      prisma.$queryRaw`
        SELECT DATE(paid_at) AS day, SUM(amount) AS revenue
        FROM payments
        WHERE status = 'SUCCESS' AND paid_at BETWEEN ${start} AND ${end}
        GROUP BY DATE(paid_at)
        ORDER BY day ASC
      `,
    ]);

    // ── Bookings by status → { STATUS: count } ──────────────────────────
    const bookingsByStatus = statusGroups.reduce((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});

    // ── Top 5 vehicle models by booking count ───────────────────────────
    const topModels = await this._rollupModels(vehicleGroups);

    // ── Revenue-by-day series, gap-filled from start→end ────────────────
    const revenueMap = new Map(
      dailyRows.map((r) => [dayKey(new Date(r.day)), Number(r.revenue) || 0])
    );
    const revenueByDay = [];
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
      const key = dayKey(new Date(t));
      revenueByDay.push({ date: key, revenue: revenueMap.get(key) ?? 0 });
    }

    const cancelRate = totalBookings > 0 ? cancelledBookings / totalBookings : 0;

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      totalRevenue: revenueAgg._sum.amount ?? 0,
      bookingsByStatus,
      totalBookings,
      newUsers,
      topModels,
      revenueByDay,
      cancelRate: Number(cancelRate.toFixed(4)),
    };
  },

  /**
   * Roll booking-per-vehicle counts up to their vehicle model, then return the
   * top 5 by booking count. Vehicles without a model are grouped as "Không rõ".
   */
  async _rollupModels(vehicleGroups) {
    if (vehicleGroups.length === 0) return [];

    const vehicleIds = vehicleGroups.map((g) => g.vehicleId);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, modelId: true, model: { select: { id: true, name: true } } },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const byModel = new Map();
    for (const g of vehicleGroups) {
      const v = vehicleById.get(g.vehicleId);
      const modelId = v?.model?.id ?? null;
      const key = modelId ?? 'none';
      const existing = byModel.get(key);
      const count = g._count._all;
      if (existing) {
        existing.bookings += count;
      } else {
        byModel.set(key, {
          modelId,
          modelName: v?.model?.name ?? 'Không rõ',
          bookings: count,
        });
      }
    }

    return [...byModel.values()]
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
  },
};

export default adminDashboardService;
