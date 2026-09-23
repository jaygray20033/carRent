// src/api/v1/admin/taxonomies/adminTaxonomy.routes.js
// Admin blog taxonomy routes (UC-56) — post categories + tags.
// Exports two routers so they can be mounted at /admin/post-categories and /admin/tags.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminCategoryController, adminTagController } from './adminTaxonomy.controller.js';
import {
  idParamSchema,
  createTaxonomySchema,
  updateTaxonomySchema,
} from './adminTaxonomy.validator.js';

/**
 * @swagger
 * /admin/post-categories:
 *   get:
 *     tags: [Admin - Blog]
 *     summary: List post categories (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Categories }
 *   post:
 *     tags: [Admin - Blog]
 *     summary: Create a post category (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Category created }
 * /admin/post-categories/{id}:
 *   patch:
 *     tags: [Admin - Blog]
 *     summary: Update a post category (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Category updated }
 *   delete:
 *     tags: [Admin - Blog]
 *     summary: Delete a post category (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Category deleted }
 * /admin/tags:
 *   get:
 *     tags: [Admin - Blog]
 *     summary: List tags (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Tags }
 *   post:
 *     tags: [Admin - Blog]
 *     summary: Create a tag (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Tag created }
 * /admin/tags/{id}:
 *   patch:
 *     tags: [Admin - Blog]
 *     summary: Update a tag (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Tag updated }
 *   delete:
 *     tags: [Admin - Blog]
 *     summary: Delete a tag (UC-56)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Tag deleted }
 */

// Build a CRUD router over a taxonomy controller quartet.
const makeRouter = (controller) => {
  const router = Router();
  router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

  router.get('/', controller.list);
  router.post('/', validate(createTaxonomySchema, 'body'), controller.create);
  router.patch(
    '/:id',
    validate(idParamSchema, 'params'),
    validate(updateTaxonomySchema, 'body'),
    controller.update
  );
  router.delete('/:id', validate(idParamSchema, 'params'), controller.remove);

  return router;
};

export const adminCategoryRoutes = makeRouter(adminCategoryController);
export const adminTagRoutes = makeRouter(adminTagController);
