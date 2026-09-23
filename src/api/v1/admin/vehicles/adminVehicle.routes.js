// src/api/v1/admin/vehicles/adminVehicle.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { uploadImages, handleUploadError } from '../../../../middlewares/upload.middleware.js';
import { adminVehicleController } from './adminVehicle.controller.js';
import {
  adminListVehiclesQuerySchema,
  createVehicleSchema,
  updateVehicleSchema,
  updateStatusSchema,
  vehicleBookingsQuerySchema,
  idParamSchema,
} from './adminVehicle.validator.js';

const router = Router();

// All admin vehicle routes require ADMIN or OPERATOR.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/vehicles:
 *   get:
 *     tags: [Admin - Vehicles]
 *     summary: List vehicles (admin) incl. non-AVAILABLE
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [AVAILABLE, RENTED, MAINTENANCE, RETIRED] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated admin list }
 */
router.get(
  '/',
  validate(adminListVehiclesQuerySchema, 'query'),
  asyncHandler(adminVehicleController.list)
);

/**
 * @swagger
 * /admin/vehicles/{id}:
 *   get:
 *     tags: [Admin - Vehicles]
 *     summary: Get vehicle detail (admin)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(adminVehicleController.detail));

/**
 * @swagger
 * /admin/vehicles:
 *   post:
 *     tags: [Admin - Vehicles]
 *     summary: Create vehicle (+ optional image URLs)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Vehicle created }
 */
router.post(
  '/',
  validate(createVehicleSchema, 'body'),
  asyncHandler(adminVehicleController.create)
);

/**
 * @swagger
 * /admin/vehicles/{id}:
 *   patch:
 *     tags: [Admin - Vehicles]
 *     summary: Update vehicle
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateVehicleSchema, 'body'),
  asyncHandler(adminVehicleController.update)
);

/**
 * @swagger
 * /admin/vehicles/{id}:
 *   delete:
 *     tags: [Admin - Vehicles]
 *     summary: Soft delete vehicle (status=RETIRED)
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(adminVehicleController.remove)
);

/**
 * @swagger
 * /admin/vehicles/{id}/status:
 *   patch:
 *     tags: [Admin - Vehicles]
 *     summary: Quick status change (AVAILABLE | MAINTENANCE | RETIRED)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [AVAILABLE, MAINTENANCE, RETIRED] }
 */
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema, 'body'),
  asyncHandler(adminVehicleController.updateStatus)
);

/**
 * @swagger
 * /admin/vehicles/{id}/bookings:
 *   get:
 *     tags: [Admin - Vehicles]
 *     summary: Booking history for a vehicle
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated booking history }
 */
router.get(
  '/:id/bookings',
  validate(idParamSchema, 'params'),
  validate(vehicleBookingsQuerySchema, 'query'),
  asyncHandler(adminVehicleController.bookings)
);

/**
 * @swagger
 * /admin/vehicles/{id}/images:
 *   post:
 *     tags: [Admin - Vehicles]
 *     summary: Upload up to 10 images (multipart field "images")
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Images uploaded, returns public URLs }
 */
router.post(
  '/:id/images',
  validate(idParamSchema, 'params'),
  uploadImages(10),
  handleUploadError,
  asyncHandler(adminVehicleController.uploadImages)
);

export default router;
