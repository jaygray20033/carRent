// src/api/v1/admin/vehicle-models/adminVehicleModel.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminVehicleModelController } from './adminVehicleModel.controller.js';
import {
  adminListModelsQuerySchema,
  createModelSchema,
  updateModelSchema,
  idParamSchema,
} from './adminVehicleModel.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/vehicle-models:
 *   get:
 *     tags: [Admin - Vehicle Models]
 *     summary: List vehicle models (admin)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate(adminListModelsQuerySchema, 'query'),
  asyncHandler(adminVehicleModelController.list)
);

/**
 * @swagger
 * /admin/vehicle-models/{id}:
 *   get:
 *     tags: [Admin - Vehicle Models]
 *     summary: Get vehicle model detail (admin)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(adminVehicleModelController.detail)
);

/**
 * @swagger
 * /admin/vehicle-models:
 *   post:
 *     tags: [Admin - Vehicle Models]
 *     summary: Create vehicle model
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  validate(createModelSchema, 'body'),
  asyncHandler(adminVehicleModelController.create)
);

/**
 * @swagger
 * /admin/vehicle-models/{id}:
 *   patch:
 *     tags: [Admin - Vehicle Models]
 *     summary: Update vehicle model
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateModelSchema, 'body'),
  asyncHandler(adminVehicleModelController.update)
);

/**
 * @swagger
 * /admin/vehicle-models/{id}:
 *   delete:
 *     tags: [Admin - Vehicle Models]
 *     summary: Delete vehicle model (blocked if in use)
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(adminVehicleModelController.remove)
);

export default router;
