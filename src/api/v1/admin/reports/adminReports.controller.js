// src/api/v1/admin/reports/adminReports.controller.js
// Day 35 (UC-59) — admin reports. The revenue endpoint additionally supports
// ?format=csv|excel|pdf to download the report as a file (bypasses the JSON
// envelope). JSON responses use a short read-through Redis cache.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success } from '../../../../utils/apiResponse.js';
import { buildCacheKey, cached } from '../../../../utils/cache.js';
import { adminReportsService } from './adminReports.service.js';
import { exportRevenue } from './reportExport.js';

const CACHE_TTL = 300; // 5 minutes

const isoOrUndef = (d) => (d ? d.toISOString() : undefined);

export const adminReportsController = {
  // GET /admin/reports/revenue?from=&to=&group=day|month&format=csv|excel|pdf
  revenue: asyncHandler(async (req, res) => {
    const { from, to, group, format } = req.query;
    const report = await adminReportsService.revenue({ from, to, group });

    if (format) {
      const handled = await exportRevenue(res, report, format);
      if (handled) return undefined;
    }

    const key = buildCacheKey('admin:reports:revenue', {
      from: isoOrUndef(from),
      to: isoOrUndef(to),
      group: report.group,
    });
    const { cached: isCached } = await cached(key, CACHE_TTL, async () => report);
    res.set('X-Cache', isCached ? 'HIT' : 'MISS');
    return success(res, report, 'Revenue report');
  }),

  // GET /admin/reports/booking?from=&to=
  booking: asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const data = await adminReportsService.booking({ from, to });
    return success(res, data, 'Booking report');
  }),

  // GET /admin/reports/top-vehicles?from=&to=&limit=10
  topVehicles: asyncHandler(async (req, res) => {
    const { from, to, limit } = req.query;
    const data = await adminReportsService.topVehicles({ from, to, limit });
    return success(res, data, 'Top vehicles report');
  }),
};

export default adminReportsController;
