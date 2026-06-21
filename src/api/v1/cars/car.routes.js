// src/api/v1/cars/car.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { carController } from './car.controller.js';
import { listCarsQuerySchema, searchQuerySchema } from './car.validator.js';

const router = Router();

/**
 * @swagger
 * /cars:
 *   get:
 *     tags: [Cars]
 *     summary: List vehicles with filter & sort (UC-10, UC-11)
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: transmission
 *         schema: { type: string, enum: [AUTO, MANUAL] }
 *       - in: query
 *         name: fuel
 *         schema: { type: string, enum: [GASOLINE, DIESEL, HYBRID, ELECTRIC] }
 *       - in: query
 *         name: seats_min
 *         schema: { type: integer }
 *       - in: query
 *         name: seats_max
 *         schema: { type: integer }
 *       - in: query
 *         name: price_min
 *         schema: { type: number }
 *       - in: query
 *         name: price_max
 *         schema: { type: number }
 *       - in: query
 *         name: station_id
 *         schema: { type: integer }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [price_asc, price_desc, newest, popular, rating] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200: { description: Paginated list of vehicles }
 */
router.get('/', validate(listCarsQuerySchema, 'query'), asyncHandler(carController.list));

/**
 * @swagger
 * /cars/search:
 *   get:
 *     tags: [Cars]
 *     summary: Auto-complete search on vehicle models + brands
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 8 }
 *     responses:
 *       200: { description: "Suggestions { models, brands, vehicles }" }
 */
router.get('/search', validate(searchQuerySchema, 'query'), asyncHandler(carController.search));

/**
 * @swagger
 * /cars/{id}:
 *   get:
 *     tags: [Cars]
 *     summary: Get vehicle detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Vehicle detail }
 *       404: { description: Not found }
 */
router.get('/:id', asyncHandler(carController.detail));

export default router;
