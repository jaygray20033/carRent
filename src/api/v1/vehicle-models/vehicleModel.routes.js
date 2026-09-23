// src/api/v1/vehicle-models/vehicleModel.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination, paginatedResponse } from '../../../utils/pagination.js';

const router = Router();

/**
 * @swagger
 * /vehicle-models:
 *   get:
 *     tags: [Catalog]
 *     summary: List vehicle models (filter by category/brand slug)
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated vehicle models }
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
