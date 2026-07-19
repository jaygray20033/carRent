// src/api/v1/supplier/supplierPortal.routes.js
// Marketplace Phase C — Supplier portal. Mounted at /supplier.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  requireSupplierMember,
  requireSupplierAdmin,
} from '../../../middlewares/supplier.middleware.js';
import { supplierPortalController } from './supplierPortal.controller.js';
import {
  bookingIdParamSchema,
  listBookingsQuerySchema,
  assignDriverSchema,
  rejectSchema,
  completeSchema,
  memberIdParamSchema,
} from './supplierPortal.validator.js';
import {
  inviteMemberSchema,
  acceptSupplierInviteSchema,
  updateMemberSchema,
} from '../admin/suppliers/adminSupplier.validator.js';

const router = Router();

// Invite accept — any authenticated user (not yet a member).
router.post(
  '/invite/accept',
  authenticate,
  validate(acceptSupplierInviteSchema, 'body'),
  supplierPortalController.acceptInvite
);

// My supplier profile + membership.
router.get('/me', authenticate, requireSupplierMember, supplierPortalController.me);

// ── Member management (Supplier Admin) ──────────────────────────────
router.get(
  '/me/members',
  authenticate,
  requireSupplierAdmin,
  supplierPortalController.listMembers
);
router.post(
  '/me/members',
  authenticate,
  requireSupplierAdmin,
  validate(inviteMemberSchema, 'body'),
  supplierPortalController.inviteMember
);
router.put(
  '/me/members/:memberId',
  authenticate,
  requireSupplierAdmin,
  validate(memberIdParamSchema, 'params'),
  validate(updateMemberSchema, 'body'),
  supplierPortalController.updateMember
);

// ── Bookings ────────────────────────────────────────────────────────
router.get(
  '/bookings',
  authenticate,
  requireSupplierMember,
  validate(listBookingsQuerySchema, 'query'),
  supplierPortalController.listBookings
);
router.get(
  '/bookings/:id',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  supplierPortalController.getBooking
);
router.get(
  '/bookings/:id/cost-summary',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  supplierPortalController.costSummary
);

// Supplier Admin: assign a driver / reject a dispatched trip.
router.put(
  '/bookings/:id/assign-driver',
  authenticate,
  requireSupplierAdmin,
  validate(bookingIdParamSchema, 'params'),
  validate(assignDriverSchema, 'body'),
  supplierPortalController.assignDriver
);
router.put(
  '/bookings/:id/reject',
  authenticate,
  requireSupplierAdmin,
  validate(bookingIdParamSchema, 'params'),
  validate(rejectSchema, 'body'),
  supplierPortalController.reject
);

// Driver (or admin): start once info released, then complete.
router.put(
  '/bookings/:id/start',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  supplierPortalController.start
);
router.put(
  '/bookings/:id/complete',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  validate(completeSchema, 'body'),
  supplierPortalController.complete
);

export default router;
