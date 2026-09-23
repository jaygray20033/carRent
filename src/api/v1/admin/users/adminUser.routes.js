// src/api/v1/admin/users/adminUser.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminUserController } from './adminUser.controller.js';
import {
  idParamSchema,
  adminListUsersQuerySchema,
  updateStatusSchema,
  updateRoleSchema,
  adjustWalletSchema,
} from './adminUser.validator.js';

const router = Router();

// User management is ADMIN/OPERATOR; role change is ADMIN only (super-admin gate).
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

const ADMIN_ONLY = requireRole(['ADMIN']);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List users (UC-55) — filter by role, status, q (name/phone/email)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [CUSTOMER, ADMIN, OPERATOR, AGENT] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, LOCKED, PENDING] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated user list }
 */
router.get(
  '/',
  validate(adminListUsersQuerySchema, 'query'),
  asyncHandler(adminUserController.list)
);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: User detail (UC-55) — profile + bookings + wallet + reviews
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: User detail }
 *       404: { description: User not found }
 */
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(adminUserController.detail)
);

/**
 * @swagger
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Set account status (UC-55) — ACTIVE | LOCKED; LOCK revokes sessions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, LOCKED] }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Status updated }
 *       404: { description: User not found }
 *       409: { description: Cannot change your own status (SELF_STATUS_CHANGE) }
 */
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateStatusSchema, 'body'),
  asyncHandler(adminUserController.updateStatus)
);

/**
 * @swagger
 * /admin/users/{id}/role:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Change a user's role (UC-55) — ADMIN only
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, ADMIN, OPERATOR, AGENT] }
 *     responses:
 *       200: { description: Role updated }
 *       403: { description: ADMIN only }
 *       404: { description: User or role not found }
 *       409: { description: Cannot change your own role (SELF_ROLE_CHANGE) }
 */
router.patch(
  '/:id/role',
  ADMIN_ONLY,
  validate(idParamSchema, 'params'),
  validate(updateRoleSchema, 'body'),
  asyncHandler(adminUserController.updateRole)
);

/**
 * @swagger
 * /admin/users/{id}/wallet/adjust:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Manual wallet adjustment (UC-55) — CREDIT | DEBIT
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, type]
 *             properties:
 *               amount: { type: number, minimum: 1 }
 *               type: { type: string, enum: [CREDIT, DEBIT] }
 *               note: { type: string }
 *     responses:
 *       200: { description: Wallet adjusted, returns wallet + transaction }
 *       400: { description: Invalid amount or insufficient balance }
 *       404: { description: User not found }
 */
router.post(
  '/:id/wallet/adjust',
  validate(idParamSchema, 'params'),
  validate(adjustWalletSchema, 'body'),
  asyncHandler(adminUserController.adjustWallet)
);

export default router;
