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
