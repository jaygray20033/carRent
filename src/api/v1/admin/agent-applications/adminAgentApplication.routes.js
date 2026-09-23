// src/api/v1/admin/agent-applications/adminAgentApplication.routes.js
// Day 38 (UC-32/33) — admin review of agent applications. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { agentApplicationController } from '../../agent-applications/agentApplication.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  reviewSchema,
} from '../../agent-applications/agentApplication.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/agent-applications:
 *   get:
 *     tags: [Admin - Agent]
 *     summary: List agent (car owner) applications (UC-33)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated agent applications }
 * /admin/agent-applications/{id}:
 *   get:
 *     tags: [Admin - Agent]
 *     summary: Get an agent application by id (UC-33)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Application detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Admin - Agent]
 *     summary: Approve or reject an application (UC-33) — approving promotes the user to AGENT
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Application reviewed }
 *       409: { description: Application already processed }
 */
router.get('/', validate(listQuerySchema, 'query'), agentApplicationController.list);
router.get('/:id', validate(idParamSchema, 'params'), agentApplicationController.detail);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(reviewSchema, 'body'),
  agentApplicationController.review
);

export default router;
