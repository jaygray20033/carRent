// src/api/v1/admin/sla-violations/adminSlaViolation.routes.js
// ENT-Day 3 UC-80 — OtoRent Admin confirm SLA violations.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  violationIdParamSchema,
  confirmViolationSchema,
} from '../../corporate/sla.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.put(
  '/:id/confirm',
  validate(violationIdParamSchema, 'params'),
  validate(confirmViolationSchema, 'body'),
  corporateController.confirmSlaViolation
);

export default router;
