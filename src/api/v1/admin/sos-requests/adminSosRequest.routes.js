// src/api/v1/admin/sos-requests/adminSosRequest.routes.js
// Day 39 (UC-35/36) — operator dispatch queue for SOS requests. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { sosRequestController } from '../../sos-requests/sosRequest.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  updateSosSchema,
  replacementSchema,
} from '../../sos-requests/sosRequest.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/sos-requests:
 *   get:
 *     tags: [Admin - SOS]
 *     summary: List SOS requests / dispatch queue (UC-35)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [REQUESTED, DISPATCHED, ON_THE_WAY, RESOLVED, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated SOS requests }
 * /admin/sos-requests/{id}:
 *   get:
 *     tags: [Admin - SOS]
 *     summary: Get an SOS request by id (UC-35)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: SOS request detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Admin - SOS]
 *     summary: Advance SOS status / assign driver (UC-35) — DISPATCHED requires driverName
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: SOS request updated }
 *       409: { description: Request already closed }
 * /admin/sos-requests/{id}/replacement:
 *   post:
 *     tags: [Admin - SOS]
 *     summary: Create a replacement booking for an SOS request (UC-36)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201: { description: Replacement booking created }
 *       409: { description: Replacement already exists }
 */
router.get('/', validate(listQuerySchema, 'query'), sosRequestController.list);
router.get('/:id', validate(idParamSchema, 'params'), sosRequestController.detail);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSosSchema, 'body'),
  sosRequestController.review
);
router.post(
  '/:id/replacement',
  validate(idParamSchema, 'params'),
  validate(replacementSchema, 'body'),
  sosRequestController.replacement
);

export default router;
