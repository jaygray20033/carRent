// src/api/v1/cars/car.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination, paginatedResponse } from '../../../utils/pagination.js';

const router = Router();

/**
 * GET /cars?page=1&size=20&brand=&category=&station=&featured=&tag=XE_DOI_MOI
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { brand, category, station, featured, tag, minPrice, maxPrice, q } = req.query;
    const { page, size, skip, orderBy } = parsePagination(req.query);

    const where = { status: 'AVAILABLE' };

    if (brand) where.brand = { slug: brand };
    if (category) where.category = { slug: category };
    if (station) where.stationId = Number(station);
    if (featured === 'true') where.isFeatured = true;
    if (tag) where.featuredTag = tag;
    if (minPrice || maxPrice) {
      where.pricePerDay = {};
      if (minPrice) where.pricePerDay.gte = Number(minPrice);
      if (maxPrice) where.pricePerDay.lte = Number(maxPrice);
    }
    if (q) {
      where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
    }

    const [items, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
          model: { select: { id: true, name: true, slug: true } },
          station: { select: { id: true, name: true, city: true } },
        },
        orderBy: orderBy || [{ createdAt: 'desc' }],
        skip,
        take: size,
      }),
      prisma.vehicle.count({ where }),
    ]);

    return success(res, paginatedResponse(items, total, { page, size }));
  })
);

/**
 * GET /cars/:id — vehicle detail
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        brand: true,
        category: true,
        model: true,
        station: true,
        images: { orderBy: { sortOrder: 'asc' } },
        reviews: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
      },
    });
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    return success(res, { vehicle });
  })
);

export default router;
