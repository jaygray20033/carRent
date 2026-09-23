// src/api/v1/roadside-stations/roadsideStation.routes.js
// Day 37 (UC-31) — public roadside/rescue stations, sorted by distance.
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';

const router = Router();

// Haversine distance in km between two lat/lng points.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * @swagger
 * /roadside-stations:
 *   get:
 *     tags: [Roadside]
 *     summary: List active rescue stations (UC-31), optionally nearest-first
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *       - in: query
 *         name: radius
 *         schema: { type: number, default: 50 }
 *         description: Radius in km (only applied when lat/lng given). Default 50.
 *     responses:
 *       200: { description: List of stations (with distanceKm when lat/lng given) }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const stations = await prisma.rescueStation.findMany({
      where: { isActive: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    // No coordinates → return the plain active list.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return success(res, { items: stations }, 'Rescue stations');
    }

    const radius = Number.isFinite(Number(req.query.radius)) ? Number(req.query.radius) : 50;
    const withDistance = stations
      .map((s) => ({ ...s, distanceKm: haversineKm(lat, lng, s.latitude, s.longitude) }))
      .filter((s) => s.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return success(res, { items: withDistance }, 'Rescue stations');
  })
);

export default router;
