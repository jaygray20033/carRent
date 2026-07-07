// src/api/v1/admin/contact-messages/adminContact.routes.js
// Day 36 (UC-29) — admin contact messages. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminContactController } from './adminContact.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  updateContactSchema,
} from './adminContact.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get('/', validate(listQuerySchema, 'query'), adminContactController.list);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateContactSchema, 'body'),
  adminContactController.update
);

export default router;
