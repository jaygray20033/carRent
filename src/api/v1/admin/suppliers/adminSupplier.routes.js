// src/api/v1/admin/suppliers/adminSupplier.routes.js
// Marketplace Phase A — Admin supplier CRUD + member management. Mounted at /admin/suppliers.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminSupplierController } from './adminSupplier.controller.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  supplierMemberParamSchema,
  listSuppliersQuerySchema,
  inviteMemberSchema,
  updateMemberSchema,
  createSupplierSettlementSchema,
  listSupplierSettlementsQuerySchema,
  adminSupplierSettlementParamSchema,
  rejectSettlementDocumentsSchema,
  markSupplierSettlementPaidSchema,
} from './adminSupplier.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listSuppliersQuerySchema, 'query'), adminSupplierController.list);
router.post('/', validate(createSupplierSchema, 'body'), adminSupplierController.create);
router.get(
  '/:id',
  validate(supplierIdParamSchema, 'params'),
  adminSupplierController.getById
);
router.put(
  '/:id',
  validate(supplierIdParamSchema, 'params'),
  validate(updateSupplierSchema, 'body'),
  adminSupplierController.update
);
router.delete(
  '/:id',
  validate(supplierIdParamSchema, 'params'),
  adminSupplierController.deactivate
);

// ── Members ───────────────────────────────────────────────────────────
router.get(
  '/:id/members',
  validate(supplierIdParamSchema, 'params'),
  adminSupplierController.listMembers
);
router.post(
  '/:id/members',
  validate(supplierIdParamSchema, 'params'),
  validate(inviteMemberSchema, 'body'),
  adminSupplierController.inviteMember
);
router.put(
  '/:id/members/:memberId',
  validate(supplierMemberParamSchema, 'params'),
  validate(updateMemberSchema, 'body'),
  adminSupplierController.updateMember
);
router.delete(
  '/:id/members/:memberId',
  validate(supplierMemberParamSchema, 'params'),
  adminSupplierController.removeMember
);

// ── Commission report ────────────────────────────────────────────────
router.get(
  '/:id/commission-report',
  validate(supplierIdParamSchema, 'params'),
  adminSupplierController.commissionReport
);

// ── Supplier payout settlements ──────────────────────────────────────
router.get(
  '/:id/settlements',
  validate(supplierIdParamSchema, 'params'),
  validate(listSupplierSettlementsQuerySchema, 'query'),
  adminSupplierController.listSettlements
);
router.post(
  '/:id/settlements',
  validate(supplierIdParamSchema, 'params'),
  validate(createSupplierSettlementSchema, 'body'),
  adminSupplierController.createSettlement
);
router.get(
  '/:id/settlements/:settlementId',
  validate(adminSupplierSettlementParamSchema, 'params'),
  adminSupplierController.getSettlement
);
router.put(
  '/:id/settlements/:settlementId/verify',
  validate(adminSupplierSettlementParamSchema, 'params'),
  adminSupplierController.verifySettlement
);
router.put(
  '/:id/settlements/:settlementId/reject',
  validate(adminSupplierSettlementParamSchema, 'params'),
  validate(rejectSettlementDocumentsSchema, 'body'),
  adminSupplierController.rejectSettlement
);
router.put(
  '/:id/settlements/:settlementId/mark-paid',
  validate(adminSupplierSettlementParamSchema, 'params'),
  validate(markSupplierSettlementPaidSchema, 'body'),
  adminSupplierController.markSettlementPaid
);

export default router;
