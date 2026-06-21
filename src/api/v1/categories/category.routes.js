// src/api/v1/categories/category.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';

const router = Router();

/**
 * GET /categories — list all vehicle categories
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { vehicles: true } },
      },
    });
    res.set('Cache-Control', 'public, max-age=3600');
    return success(res, { categories });
  })
);

export default router;
