// src/api/v1/admin/comments/adminComment.routes.js
// Admin comment moderation routes (UC-24).
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminCommentController } from './adminComment.controller.js';
import { idParamSchema, listQuerySchema, moderateSchema } from './adminComment.validator.js';

const router = Router();

// All admin comment routes require ADMIN or OPERATOR.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/comments:
 *   get:
 *     tags: [Admin - Blog]
 *     summary: Comment moderation queue (UC-24)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *     responses:
 *       200: { description: Comments }
 */
router.get('/', validate(listQuerySchema, 'query'), adminCommentController.list);

/**
 * @swagger
 * /admin/comments/{id}:
 *   patch:
 *     tags: [Admin - Blog]
 *     summary: Approve or reject a comment (UC-24)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Comment moderated }
 */
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(moderateSchema, 'body'),
  adminCommentController.moderate
);

export default router;
