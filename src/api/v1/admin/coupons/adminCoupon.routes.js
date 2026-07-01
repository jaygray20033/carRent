// src/api/v1/admin/coupons/adminCoupon.routes.js
// Admin coupon CRUD routes (UC-57).
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminCouponController } from './adminCoupon.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  createCouponSchema,
  updateCouponSchema,
} from './adminCoupon.validator.js';

const router = Router();

// All admin coupon routes require ADMIN or OPERATOR.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listQuerySchema, 'query'), adminCouponController.list);
router.get('/:id', validate(idParamSchema, 'params'), adminCouponController.detail);
router.post('/', validate(createCouponSchema, 'body'), adminCouponController.create);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCouponSchema, 'body'),
  adminCouponController.update
);
router.delete('/:id', validate(idParamSchema, 'params'), adminCouponController.remove);

export default router;
