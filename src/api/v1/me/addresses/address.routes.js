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

// UC-42 — list + create
router.get('/', asyncHandler(addressController.list));
router.post('/', validate(createAddressSchema), asyncHandler(addressController.create));

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

// UC-43 — set default (atomic)
router.patch(
  '/:id/default',
  validate(addressIdSchema, 'params'),
  asyncHandler(addressController.setDefault)
);

export default router;
