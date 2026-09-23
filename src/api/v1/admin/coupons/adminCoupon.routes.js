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

/**
 * @swagger
 * /admin/coupons:
 *   get:
 *     tags: [Admin - Coupons]
 *     summary: List coupons (UC-57)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Paginated coupons }
 *   post:
 *     tags: [Admin - Coupons]
 *     summary: Create a coupon (UC-57)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Coupon created }
 *       409: { description: Coupon code already exists }
 */
router.get('/', validate(listQuerySchema, 'query'), adminCouponController.list);
router.post('/', validate(createCouponSchema, 'body'), adminCouponController.create);

/**
 * @swagger
 * /admin/coupons/{id}:
 *   get:
 *     tags: [Admin - Coupons]
 *     summary: Coupon detail (UC-57)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Coupon detail }
 *       404: { description: Coupon not found }
 *   patch:
 *     tags: [Admin - Coupons]
 *     summary: Update a coupon (UC-57)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Coupon updated }
 *   delete:
 *     tags: [Admin - Coupons]
 *     summary: Delete a coupon (UC-57)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Coupon deleted }
 */
router.get('/:id', validate(idParamSchema, 'params'), adminCouponController.detail);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateCouponSchema, 'body'),
  adminCouponController.update
);
router.delete('/:id', validate(idParamSchema, 'params'), adminCouponController.remove);

export default router;
