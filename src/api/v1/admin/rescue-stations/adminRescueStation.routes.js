// src/api/v1/admin/rescue-stations/adminRescueStation.routes.js
// Day 37 (UC-31) — admin rescue station CRUD. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminRescueStationController } from './adminRescueStation.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  createStationSchema,
  updateStationSchema,
} from './adminRescueStation.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listQuerySchema, 'query'), adminRescueStationController.list);
router.get('/:id', validate(idParamSchema, 'params'), adminRescueStationController.detail);
router.post('/', validate(createStationSchema, 'body'), adminRescueStationController.create);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateStationSchema, 'body'),
  adminRescueStationController.update
);
router.delete('/:id', validate(idParamSchema, 'params'), adminRescueStationController.remove);

export default router;
