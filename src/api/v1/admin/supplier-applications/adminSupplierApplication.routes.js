// Admin review of supplier (nhà xe) applications. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { supplierApplicationController } from '../../supplier-applications/supplierApplication.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  reviewSchema,
} from '../../supplier-applications/supplierApplication.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listQuerySchema, 'query'), supplierApplicationController.list);
router.get('/:id', validate(idParamSchema, 'params'), supplierApplicationController.detail);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(reviewSchema, 'body'),
  supplierApplicationController.review
);

export default router;
