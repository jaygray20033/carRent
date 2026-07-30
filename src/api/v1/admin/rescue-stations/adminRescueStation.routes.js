// src/api/v1/admin/rescue-stations/adminRescueStation.routes.js
// Day 37 (UC-31) — admin rescue station CRUD. ADMIN/OPERATOR only.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminRescueStationController } from './adminRescueStation.controller.js';
import {
  idParamSchema,
  listQuerySchema,
  createStationSchema,
  updateStationSchema,
} from './adminRescueStation.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

/**
 * @swagger
 * /admin/rescue-stations:
 *   get:
 *     tags: [Admin - Rescue Stations]
 *     summary: List rescue stations (UC-31)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated rescue stations }
 *   post:
 *     tags: [Admin - Rescue Stations]
 *     summary: Create a rescue station (UC-31)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Station created }
 * /admin/rescue-stations/{id}:
 *   get:
 *     tags: [Admin - Rescue Stations]
 *     summary: Get a rescue station by id (UC-31)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Station detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Admin - Rescue Stations]
 *     summary: Update a rescue station (UC-31)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Station updated }
 *   delete:
 *     tags: [Admin - Rescue Stations]
 *     summary: Delete a rescue station (UC-31)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Station deleted }
 */
router.get('/', validate(listQuerySchema, 'query'), adminRescueStationController.list);
router.get('/:id', validate(idParamSchema, 'params'), adminRescueStationController.detail);
router.post('/', validate(createStationSchema, 'body'), adminRescueStationController.create);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateStationSchema, 'body'),
  adminRescueStationController.update
);
router.delete('/:id', validate(idParamSchema, 'params'), adminRescueStationController.remove);

export default router;
