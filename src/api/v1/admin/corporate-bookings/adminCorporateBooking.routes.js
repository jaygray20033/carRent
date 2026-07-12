// src/api/v1/admin/corporate-bookings/adminCorporateBooking.routes.js
// B2B Day 7 UC-72 — OtoRent Admin B2B booking ops: list, assign-driver, start, confirm.
import { Router } from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { corporateController } from '../../corporate/corporate.controller.js';
import {
  bookingIdParamSchema,
  adminListBookingsQuerySchema,
  assignDriverSchema,
} from '../../corporate/corporateBooking.validator.js';

const router = Router();

router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

router.get(
  '/',
  validate(adminListBookingsQuerySchema, 'query'),
  corporateController.adminListBookings
);

router.put(
  '/:id/assign-driver',
  validate(bookingIdParamSchema, 'params'),
  validate(assignDriverSchema, 'body'),
  corporateController.assignDriver
);

router.put(
  '/:id/start',
  validate(bookingIdParamSchema, 'params'),
  corporateController.startBooking
);

router.put(
  '/:id/confirm-otorent',
  validate(bookingIdParamSchema, 'params'),
  corporateController.confirmOtorent
);

export default router;
