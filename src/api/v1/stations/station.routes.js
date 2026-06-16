// src/api/v1/stations/station.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { city } = req.query;
    const where = { isActive: true };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    const stations = await prisma.station.findMany({ where, orderBy: { name: 'asc' } });
    return success(res, { stations });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const station = await prisma.station.findUnique({ where: { id: Number(req.params.id) } });
    return success(res, { station });
  })
);

export default router;
