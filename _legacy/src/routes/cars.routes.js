// src/routes/cars.routes.js
import { Router } from 'express';
import * as carsCtrl from '../controllers/cars.controller.js';

const router = Router();

/**
 * @swagger
 * /cars:
 *   get:
 *     summary: List vehicles with filters, sorting and pagination
 *     tags: [Cars]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *       - in: query
 *         name: brandId
 *         schema: { type: integer }
 *       - in: query
 *         name: categoryId
 *         schema: { type: integer }
 *       - in: query
 *         name: stationId
 *         schema: { type: integer }
 *       - in: query
 *         name: seats
 *         schema: { type: integer }
 *       - in: query
 *         name: transmission
 *         schema: { type: string, enum: [AUTO, MANUAL] }
 *       - in: query
 *         name: fuelType
 *         schema: { type: string, enum: [GASOLINE, DIESEL, ELECTRIC, HYBRID] }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: isFeatured
 *         schema: { type: boolean }
 *       - in: query
 *         name: featuredTag
 *         schema: { type: string, enum: [XE_DOI_MOI, XE_SANG, DAT_HANG] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [pricePerDay, rating, reviewCount, modelYear, createdAt, name], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated vehicle list
 */
router.get('/', carsCtrl.listVehicles);

/**
 * @swagger
 * /cars/{id}:
 *   get:
 *     summary: Get vehicle detail by id
 *     tags: [Cars]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle detail
 *       404:
 *         description: Vehicle not found
 */
router.get('/:id', carsCtrl.getVehicle);

/**
 * @swagger
 * /cars/{id}/availability:
 *   get:
 *     summary: Check vehicle availability for a date range
 *     tags: [Cars]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date-time }
 *         description: Start of range (ISO 8601)
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date-time }
 *         description: End of range (ISO 8601)
 *     responses:
 *       200:
 *         description: Availability info with blocked ranges
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicleId:
 *                       type: integer
 *                     queryRange:
 *                       type: object
 *                       properties:
 *                         from: { type: string, format: date-time }
 *                         to: { type: string, format: date-time }
 *                     blockedRanges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           bookingCode: { type: string }
 *                           pickupAt: { type: string, format: date-time }
 *                           returnAt: { type: string, format: date-time }
 *                           status: { type: string }
 *                     isAvailable:
 *                       type: boolean
 *       400:
 *         description: Missing or invalid params
 *       404:
 *         description: Vehicle not found
 */
router.get('/:id/availability', carsCtrl.getAvailability);

export default router;
