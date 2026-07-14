// src/api/v1/admin/vas/adminVas.routes.js
// ENT-Day 2 UC-76 — OtoRent Admin VAS catalog CRUD.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  createVasSchema,
  updateVasSchema,
  vasIdParamSchema,
} from '../../corporate/vas.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.post('/', validate(createVasSchema, 'body'), corporateController.createVas);
router.put(
  '/:id',
  validate(vasIdParamSchema, 'params'),
  validate(updateVasSchema, 'body'),
  corporateController.updateVas
);

export default router;
