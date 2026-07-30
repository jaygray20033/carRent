// src/api/v1/supplier/supplierPortal.routes.js
// Marketplace Phase C — Supplier portal. Mounted at /supplier.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { rateLimit } from '../../../middlewares/rateLimit.middleware.js';
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
  addExpenseSchema,
  expenseIdParamSchema,
  memberIdParamSchema,
  settlementIdParamSchema,
} from './supplierPortal.validator.js';
import {
  inviteMemberSchema,
  acceptSupplierInviteSchema,
  updateMemberSchema,
  listSupplierSettlementsQuerySchema,
  submitSettlementDocumentsSchema,
  createSupplierInviteLinkSchema,
  supplierInviteLinkIdParamSchema,
  joinSupplierViaLinkSchema,
  supplierLinkTokenParamSchema,
} from '../admin/suppliers/adminSupplier.validator.js';

const router = Router();

// Invite abuse guard — 20 member invites / hour / IP (mirrors corporate invite).
const inviteLimiter = rateLimit({
  max: 20,
  windowSec: 3600,
  keyPrefix: 'supplier:invite',
  message: 'Bạn đã gửi quá nhiều lời mời. Vui lòng thử lại sau một giờ.',
});

// Invite accept — any authenticated user (not yet a member).
router.post(
  '/invite/accept',
  authenticate,
  validate(acceptSupplierInviteSchema, 'body'),
  supplierPortalController.acceptInvite
);

// ── Shareable multi-use join link ──────────────────────────────────
// Public preview — no auth. New users hit this before registering.
router.get(
  '/invite/link/:token',
  validate(supplierLinkTokenParamSchema, 'params'),
  supplierPortalController.previewInviteLink
);
// Authenticated join — creates an ACTIVE member row immediately.
router.post(
  '/invite/link/join',
  authenticate,
  validate(joinSupplierViaLinkSchema, 'body'),
  supplierPortalController.joinViaLink
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
  inviteLimiter,
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
router.post(
  '/me/members/:memberId/resend-invite',
  authenticate,
  inviteLimiter,
  requireSupplierAdmin,
  validate(memberIdParamSchema, 'params'),
  supplierPortalController.resendMemberInvite
);
router.delete(
  '/me/members/:memberId',
  authenticate,
  requireSupplierAdmin,
  validate(memberIdParamSchema, 'params'),
  supplierPortalController.removeMember
);

// Shareable join links — Supplier Admin manages.
router.get(
  '/me/invite-links',
  authenticate,
  requireSupplierAdmin,
  supplierPortalController.listInviteLinks
);
router.post(
  '/me/invite-links',
  authenticate,
  inviteLimiter,
  requireSupplierAdmin,
  validate(createSupplierInviteLinkSchema, 'body'),
  supplierPortalController.createInviteLink
);
router.delete(
  '/me/invite-links/:linkId',
  authenticate,
  requireSupplierAdmin,
  validate(supplierInviteLinkIdParamSchema, 'params'),
  supplierPortalController.revokeInviteLink
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

// ── Trip expenses (driver logs tolls, parking, overtime… on the road) ──
router.get(
  '/bookings/:id/expenses',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  supplierPortalController.listExpenses
);
router.post(
  '/bookings/:id/expenses',
  authenticate,
  requireSupplierMember,
  validate(bookingIdParamSchema, 'params'),
  validate(addExpenseSchema, 'body'),
  supplierPortalController.addExpense
);
router.delete(
  '/bookings/:id/expenses/:expenseId',
  authenticate,
  requireSupplierMember,
  validate(expenseIdParamSchema, 'params'),
  supplierPortalController.deleteExpense
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

// ── Payout settlements (view + submit documents) ────────────────────
router.get(
  '/settlements',
  authenticate,
  requireSupplierMember,
  validate(listSupplierSettlementsQuerySchema, 'query'),
  supplierPortalController.listSettlements
);
router.get(
  '/settlements/:settlementId',
  authenticate,
  requireSupplierMember,
  validate(settlementIdParamSchema, 'params'),
  supplierPortalController.getSettlement
);
router.post(
  '/settlements/:settlementId/documents',
  authenticate,
  requireSupplierAdmin,
  validate(settlementIdParamSchema, 'params'),
  validate(submitSettlementDocumentsSchema, 'body'),
  supplierPortalController.submitSettlementDocuments
);

export default router;
