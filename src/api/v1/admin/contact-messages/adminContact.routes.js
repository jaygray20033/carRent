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

/**
 * @swagger
 * /admin/contact-messages:
 *   get:
 *     tags: [Admin - Contact]
 *     summary: List contact messages (UC-29)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [NEW, IN_PROGRESS, RESOLVED] }
 *     responses:
 *       200: { description: Contact messages }
 */
router.get('/', validate(listQuerySchema, 'query'), adminContactController.list);

/**
 * @swagger
 * /admin/contact-messages/{id}:
 *   patch:
 *     tags: [Admin - Contact]
 *     summary: Update a contact message status / add a reply note (UC-29)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Contact message updated }
 */
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateContactSchema, 'body'),
  adminContactController.update
);

export default router;
