// src/api/v1/vehicle-models/vehicleModel.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination, paginatedResponse } from '../../../utils/pagination.js';

const router = Router();

/**
 * GET /vehicle-models?category=slug&brand=slug&page=1&size=20
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, brand } = req.query;
    const { page, size, skip, orderBy } = parsePagination(req.query);

    const where = {};
    if (category) {
      where.category = { slug: category };
    }
    if (brand) {
      where.brand = { slug: brand };
    }

    const [items, total] = await Promise.all([
      prisma.vehicleModel.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: orderBy || [{ name: 'asc' }],
        skip,
        take: size,
      }),
      prisma.vehicleModel.count({ where }),
    ]);

    return success(res, paginatedResponse(items, total, { page, size }));
  })
);

export default router;
