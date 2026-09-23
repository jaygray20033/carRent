// src/api/v1/me/addresses/address.routes.js
// Mounted at /me/addresses (see api/v1/index.js). All routes require auth.
import { Router } from 'express';
import { addressController } from './address.controller.js';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema,
} from './address.validator.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /me/addresses:
 *   get:
 *     tags: [Account]
 *     summary: List my saved addresses (UC-42)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Address list }
 *   post:
 *     tags: [Account]
 *     summary: Add a new address (UC-42)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Address created }
 */
// UC-42 — list + create
router.get('/', asyncHandler(addressController.list));
router.post('/', validate(createAddressSchema), asyncHandler(addressController.create));

/**
 * @swagger
 * /me/addresses/{id}:
 *   patch:
 *     tags: [Account]
 *     summary: Update an address (UC-42)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Address updated }
 *   delete:
 *     tags: [Account]
 *     summary: Delete an address (UC-42)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Address deleted }
 */
// UC-42 — update + delete
router.patch(
  '/:id',
  validate(addressIdSchema, 'params'),
  validate(updateAddressSchema),
  asyncHandler(addressController.update)
);
router.delete(
  '/:id',
  validate(addressIdSchema, 'params'),
  asyncHandler(addressController.remove)
);

/**
 * @swagger
 * /me/addresses/{id}/default:
 *   patch:
 *     tags: [Account]
 *     summary: Set an address as default (UC-43)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Default address updated }
 */
// UC-43 — set default (atomic)
router.patch(
  '/:id/default',
  validate(addressIdSchema, 'params'),
  asyncHandler(addressController.setDefault)
);

export default router;
