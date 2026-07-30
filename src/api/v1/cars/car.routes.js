// src/api/v1/cars/car.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { carController } from './car.controller.js';
import { listCarsQuerySchema, searchQuerySchema, availabilityQuerySchema } from './car.validator.js';
import { reviewController } from '../reviews/review.controller.js';

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
 *       200: { description: "Suggestions (models, brands, vehicles)" }
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
router.get('/:id(\\d+)', asyncHandler(carController.detail));

/**
 * @swagger
 * /cars/{id}/similar:
 *   get:
 *     tags: [Cars]
 *     summary: List similar vehicles (same category or brand, exclude self)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 4 }
 *     responses:
 *       200: { description: Up to 4 similar vehicles }
 *       404: { description: Reference vehicle not found }
 */
router.get('/:id(\\d+)/similar', asyncHandler(carController.similar));

/**
 * @swagger
 * /cars/{id}/reviews:
 *   get:
 *     tags: [Cars]
 *     summary: List APPROVED reviews for a vehicle (UC-50)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200: { description: Paginated reviews for the vehicle }
 */
router.get('/:id(\\d+)/reviews', asyncHandler(reviewController.listByVehicle));

/**
 * @swagger
 * /cars/{id}/availability:
 *   get:
 *     tags: [Cars]
 *     summary: Booked periods that occupy the vehicle (UC-08 date picker) — Day 10
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: "Array of { from, to, status } booked intervals" }
 *       404: { description: Vehicle not found }
 */
router.get(
  '/:id(\\d+)/availability',
  validate(availabilityQuerySchema, 'query'),
  asyncHandler(carController.availability)
);

/**
 * @swagger
 * /cars/{slug}:
 *   get:
 *     tags: [Cars]
 *     summary: Get vehicle detail by slug (includes images) — DoD Day 8
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Vehicle detail with images }
 *       404: { description: Not found }
 */
router.get('/:slug', asyncHandler(carController.detailBySlug));

export default router;
