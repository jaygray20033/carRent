// src/api/v1/cars/car.routes.js
import { Router } from 'express';
import { carController } from './car.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/rbac.middleware.js';
import {
  listCarsQuerySchema,
  createCarSchema,
  updateCarSchema,
} from './car.validator.js';

const router = Router();

// Public
router.get('/', validate(listCarsQuerySchema, 'query'), asyncHandler(carController.list));
router.get('/:id', asyncHandler(carController.detail));

// Admin only
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  validate(createCarSchema),
  asyncHandler(carController.create)
);
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  validate(updateCarSchema),
  asyncHandler(carController.update)
);
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(carController.delete)
);

export default router;
