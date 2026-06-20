// src/api/v1/brands/brand.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';

const router = Router();

/**
 * GET /brands — list all brands (cache-friendly, no pagination needed)
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { vehicles: true } },
      },
    });
    // Cache 1h
    res.set('Cache-Control', 'public, max-age=3600');
    return success(res, { brands });
  })
);

export default router;
