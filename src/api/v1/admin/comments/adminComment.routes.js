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

// GET /admin/comments?status=PENDING&page=&size=
router.get('/', validate(listQuerySchema, 'query'), adminCommentController.list);

// PATCH /admin/comments/:id — body { status: APPROVED|REJECTED }
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(moderateSchema, 'body'),
  adminCommentController.moderate
);

export default router;
