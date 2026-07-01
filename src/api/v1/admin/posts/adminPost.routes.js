// src/api/v1/admin/posts/adminPost.routes.js
// Admin blog CRUD routes (UC-56).
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminPostController } from './adminPost.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  createPostSchema,
  updatePostSchema,
} from './adminPost.validator.js';

const router = Router();

// All admin blog routes require ADMIN or OPERATOR.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(adminPostController.list));
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(adminPostController.detail));
router.post('/', validate(createPostSchema, 'body'), asyncHandler(adminPostController.create));
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updatePostSchema, 'body'),
  asyncHandler(adminPostController.update)
);
router.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(adminPostController.remove));

export default router;
