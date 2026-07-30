// src/api/v1/admin/sla-violations/adminSlaViolation.routes.js
// ENT-Day 3 UC-80 — CarGoGo Admin queue + confirm SLA violations from enterprises.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  violationIdParamSchema,
  confirmViolationSchema,
  adminListViolationsQuerySchema,
} from '../../corporate/sla.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get(
  '/',
  validate(adminListViolationsQuerySchema, 'query'),
  corporateController.adminListSlaViolations
);

router.put(
  '/:id/confirm',
  validate(violationIdParamSchema, 'params'),
  validate(confirmViolationSchema, 'body'),
  corporateController.confirmSlaViolation
);

export default router;
