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

/**
 * @swagger
 * /admin/posts:
 *   get:
 *     tags: [Admin - Blog]
 *     summary: List blog posts (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, PUBLISHED, ARCHIVED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated posts }
 *   post:
 *     tags: [Admin - Blog]
 *     summary: Create a blog post (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Post created }
 */
router.get('/', validate(listQuerySchema, 'query'), asyncHandler(adminPostController.list));
/**
 * @swagger
 * /admin/posts/{id}:
 *   get:
 *     tags: [Admin - Blog]
 *     summary: Get a blog post by id (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Post detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Admin - Blog]
 *     summary: Update a blog post (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Post updated }
 *   delete:
 *     tags: [Admin - Blog]
 *     summary: Delete a blog post (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Post deleted }
 */
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
