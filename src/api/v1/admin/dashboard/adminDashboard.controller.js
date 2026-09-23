// src/api/v1/admin/dashboard/adminDashboard.controller.js
// Admin dashboard KPI controller (UC-52). Read-through Redis cache, 5-min TTL,
// keyed by the (normalised) from/to querystring.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success } from '../../../../utils/apiResponse.js';
import { buildCacheKey, cached } from '../../../../utils/cache.js';
import { adminDashboardService } from './adminDashboard.service.js';

const CACHE_PREFIX = 'admin:dashboard';
const CACHE_TTL = 300; // 5 minutes

export const adminDashboardController = {
  // GET /admin/dashboard?from=&to=
  kpis: asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const key = buildCacheKey(CACHE_PREFIX, {
      from: from ? from.toISOString() : undefined,
      to: to ? to.toISOString() : undefined,
    });

    const { data, cached: isCached } = await cached(key, CACHE_TTL, () =>
      adminDashboardService.getKpis({ from, to })
    );

    res.set('X-Cache', isCached ? 'HIT' : 'MISS');
    return success(res, data);
  }),
};

export default adminDashboardController;
