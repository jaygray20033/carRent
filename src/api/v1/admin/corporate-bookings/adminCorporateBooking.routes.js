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
import {
  bookingVasParamSchema,
  assignVasProviderSchema,
} from '../../corporate/vas.validator.js';
import { adminSupplierController } from '../suppliers/adminSupplier.controller.js';
import {
  dispatchSchema,
  recallSchema,
  releaseDriverInfoSchema,
} from '../suppliers/adminSupplier.validator.js';

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

// ENT-Day 2 — assign VAS provider → CONFIRMED
router.put(
  '/:id/vas/:vasId/assign',
  validate(bookingVasParamSchema, 'params'),
  validate(assignVasProviderSchema, 'body'),
  corporateController.assignBookingVas
);

// ── Marketplace dispatch (Phase B) ──────────────────────────────────
// Dispatch an APPROVED booking to a supplier (white-label). Recall reverses it.
// release-driver-info relays the supplier-assigned driver back to the company.
router.put(
  '/:id/dispatch',
  validate(bookingIdParamSchema, 'params'),
  validate(dispatchSchema, 'body'),
  adminSupplierController.dispatch
);
router.put(
  '/:id/recall',
  validate(bookingIdParamSchema, 'params'),
  validate(recallSchema, 'body'),
  adminSupplierController.recall
);
router.put(
  '/:id/release-driver-info',
  validate(bookingIdParamSchema, 'params'),
  validate(releaseDriverInfoSchema, 'body'),
  adminSupplierController.releaseDriverInfo
);
router.get(
  '/:id/dispatch-record',
  validate(bookingIdParamSchema, 'params'),
  adminSupplierController.exportDispatchRecord
);

export default router;
