// src/api/v1/stations/station.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination, paginatedResponse } from '../../../utils/pagination.js';

const router = Router();

/**
 * @swagger
 * /stations:
 *   get:
 *     tags: [Catalog]
 *     summary: List active stations (filter by type/q, paginated)
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [AIRPORT, CITY, HQ] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated stations }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type, q } = req.query;
    const { page, size, skip, orderBy } = parsePagination(req.query);

    const where = { isActive: true };
    if (type) where.type = type;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { city: { contains: q } },
        { address: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.station.findMany({
        where,
        orderBy: orderBy || [{ name: 'asc' }],
        skip,
        take: size,
      }),
      prisma.station.count({ where }),
    ]);

    return success(res, paginatedResponse(items, total, { page, size }));
  })
);

/**
 * @swagger
 * /stations/{id}:
 *   get:
 *     tags: [Catalog]
 *     summary: Get a station by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Station detail }
 *       404: { description: Station not found }
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const station = await prisma.station.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });
    return success(res, { station });
  })
);

export default router;
