// src/api/v1/admin/settlements/adminSettlement.routes.js
// B2B Day 5 — OtoRent Admin settlement ops (detail / send / mark-paid / export).
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  settlementIdParamSchema,
  markPaidSchema,
} from '../../corporate/settlement.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get(
  '/:id',
  validate(settlementIdParamSchema, 'params'),
  corporateController.getSettlement
);
router.put(
  '/:id/send',
  validate(settlementIdParamSchema, 'params'),
  corporateController.sendSettlement
);
router.put(
  '/:id/mark-paid',
  validate(settlementIdParamSchema, 'params'),
  validate(markPaidSchema, 'body'),
  corporateController.markSettlementPaid
);
router.get(
  '/:id/export',
  validate(settlementIdParamSchema, 'params'),
  corporateController.exportSettlementPdf
);

export default router;
