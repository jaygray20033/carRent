// src/api/v1/corporate/corporate.routes.js
// B2B Day 2–4 — Corporate portal routes (UC-62 → UC-68).
// Mounted at /corporate.
import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import {
  requireCorporateAdmin,
  requireCorporateEmployee,
} from '../../../middlewares/corporate.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { uploadImage, handleUploadError } from '../../../middlewares/upload.middleware.js';
import { rateLimit } from '../../../middlewares/rateLimit.middleware.js';
import { corporateController } from './corporate.controller.js';
import {
  inviteEmployeeSchema,
  acceptInviteSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
  employeeIdParamSchema,
  createInviteLinkSchema,
  inviteLinkIdParamSchema,
  joinViaLinkSchema,
  linkTokenParamSchema,
} from './corporateEmployee.validator.js';
import {
  selfRegisterCorporateSchema,
  updateMyCompanySchema,
} from './corporateClient.validator.js';
import {
  createBookingSchema,
  listBookingsQuerySchema,
  bookingIdParamSchema,
  approveBookingSchema,
  rejectBookingSchema,
  addExpenseSchema,
  expenseIdParamSchema,
  approveExpenseSchema,
  completeBookingSchema,
  confirmAndFinalizeSchema,
} from './corporateBooking.validator.js';
import {
  settlementIdParamSchema,
  listSettlementsQuerySchema,
  disputeSettlementSchema,
  dashboardQuerySchema,
  tripsReportQuerySchema,
} from './settlement.validator.js';
import {
  addBookingVasSchema,
  bookingVasParamSchema,
} from './vas.validator.js';
import { reportViolationSchema } from './sla.validator.js';
import { z } from 'zod';

const amendmentIdOnlySchema = z.object({
  id: z.coerce.number().int().positive(),
});

const router = Router();

// ── Rate limiters (Redis-backed, per-IP; no-op when RATE_LIMIT_DISABLED) ──
// Invites send email + create pending memberships — throttle to curb spam/abuse.
const inviteLimiter = rateLimit({
  max: 20,
  windowSec: 3600,
  keyPrefix: 'corp:invite',
  message: 'Bạn đã gửi quá nhiều lời mời. Vui lòng thử lại sau một giờ.',
});
// Expense writes are frequent but still worth a generous per-minute ceiling.
const expenseLimiter = rateLimit({
  max: 30,
  windowSec: 60,
  keyPrefix: 'corp:expense',
  message: 'Bạn thao tác chi phí quá nhanh. Vui lòng thử lại sau giây lát.',
});

// Self-registration — any authenticated user creates a company + becomes its admin.
// Instant activation (no CarGoGo approval). Blocks if already a member.
router.post(
  '/self-register',
  authenticate,
  validate(selfRegisterCorporateSchema, 'body'),
  corporateController.selfRegister
);

// Invite accept — any authenticated user (not yet a member).
router.post(
  '/invite/accept',
  authenticate,
  validate(acceptInviteSchema, 'body'),
  corporateController.acceptInvite
);

// ── Shareable multi-use join link ──────────────────────────────────
// Public preview — no auth. New users hit this before registering.
router.get(
  '/invite/link/:token',
  validate(linkTokenParamSchema, 'params'),
  corporateController.previewInviteLink
);
// Authenticated join — creates an ACTIVE employee row immediately.
router.post(
  '/invite/link/join',
  authenticate,
  validate(joinViaLinkSchema, 'body'),
  corporateController.joinViaLink
);

// My company — any active corporate employee.
router.get(
  '/me/company',
  authenticate,
  requireCorporateEmployee,
  corporateController.myCompany
);

// Corporate-admin self-service company settings (e.g. auto-approve toggle).
// Self-scoped via req.corporate.id — no company id in the body.
router.patch(
  '/me/company',
  authenticate,
  requireCorporateAdmin,
  validate(updateMyCompanySchema, 'body'),
  corporateController.updateMyCompany
);

// Price config for booking form (Day 3).
router.get(
  '/me/price-config',
  authenticate,
  requireCorporateEmployee,
  corporateController.myPriceConfig
);

// ENT-Day 2 — negotiated VAS pricing for my company.
router.get(
  '/me/vas-pricing',
  authenticate,
  requireCorporateEmployee,
  corporateController.myVasPricing
);

// ENT-Day 5 — my company's SLA catalog + risk flags.
router.get(
  '/me/sla',
  authenticate,
  requireCorporateEmployee,
  corporateController.listMySla
);

// ENT-Day 3 — amendments for my company.
router.get(
  '/me/amendments',
  authenticate,
  requireCorporateEmployee,
  corporateController.listMyAmendments
);
router.put(
  '/me/amendments/:id/sign-a',
  authenticate,
  requireCorporateAdmin,
  validate(amendmentIdOnlySchema, 'params'),
  corporateController.signAmendmentA
);

// Employee management — Corporate Admin only.
router.get(
  '/me/company/employees',
  authenticate,
  requireCorporateAdmin,
  validate(listEmployeesQuerySchema, 'query'),
  corporateController.listEmployees
);
router.post(
  '/me/company/employees',
  authenticate,
  inviteLimiter,
  requireCorporateAdmin,
  validate(inviteEmployeeSchema, 'body'),
  corporateController.inviteEmployee
);
router.put(
  '/me/company/employees/:id',
  authenticate,
  requireCorporateAdmin,
  validate(employeeIdParamSchema, 'params'),
  validate(updateEmployeeSchema, 'body'),
  corporateController.updateEmployee
);
router.delete(
  '/me/company/employees/:id',
  authenticate,
  requireCorporateAdmin,
  validate(employeeIdParamSchema, 'params'),
  corporateController.removeEmployee
);
router.post(
  '/me/company/employees/:id/resend-invite',
  authenticate,
  inviteLimiter,
  requireCorporateAdmin,
  validate(employeeIdParamSchema, 'params'),
  corporateController.resendEmployeeInvite
);

// Shareable join links — Corporate Admin manages.
router.get(
  '/me/company/invite-links',
  authenticate,
  requireCorporateAdmin,
  corporateController.listInviteLinks
);
router.post(
  '/me/company/invite-links',
  authenticate,
  inviteLimiter,
  requireCorporateAdmin,
  validate(createInviteLinkSchema, 'body'),
  corporateController.createInviteLink
);
router.delete(
  '/me/company/invite-links/:linkId',
  authenticate,
  requireCorporateAdmin,
  validate(inviteLinkIdParamSchema, 'params'),
  corporateController.revokeInviteLink
);

// ── Bookings (Day 3) ────────────────────────────────────────────────
router.post(
  '/bookings',
  authenticate,
  requireCorporateEmployee,
  validate(createBookingSchema, 'body'),
  corporateController.createBooking
);
router.get(
  '/bookings',
  authenticate,
  requireCorporateEmployee,
  validate(listBookingsQuerySchema, 'query'),
  corporateController.listBookings
);
router.get(
  '/bookings/:id',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.getBooking
);
router.put(
  '/bookings/:id/approve',
  authenticate,
  requireCorporateAdmin,
  validate(bookingIdParamSchema, 'params'),
  validate(approveBookingSchema, 'body'),
  corporateController.approveBooking
);
router.put(
  '/bookings/:id/reject',
  authenticate,
  requireCorporateAdmin,
  validate(bookingIdParamSchema, 'params'),
  validate(rejectBookingSchema, 'body'),
  corporateController.rejectBooking
);
router.put(
  '/bookings/:id/cancel',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.cancelBooking
);

// ── Expenses + confirm (Day 4) ──────────────────────────────────────
router.post(
  '/bookings/:id/expenses',
  authenticate,
  expenseLimiter,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  validate(addExpenseSchema, 'body'),
  corporateController.addExpense
);
router.get(
  '/bookings/:id/expenses',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.listExpenses
);
router.delete(
  '/bookings/:id/expenses/:expenseId',
  authenticate,
  requireCorporateEmployee,
  validate(expenseIdParamSchema, 'params'),
  corporateController.deleteExpense
);
router.put(
  '/bookings/:id/expenses/:expenseId/approve',
  authenticate,
  requireCorporateAdmin,
  validate(expenseIdParamSchema, 'params'),
  validate(approveExpenseSchema, 'body'),
  corporateController.approveExpense
);
router.post(
  '/bookings/:id/upload-receipt',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  uploadImage,
  handleUploadError,
  corporateController.uploadReceipt
);
router.put(
  '/bookings/:id/complete',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  validate(completeBookingSchema, 'body'),
  corporateController.completeBooking
);
router.put(
  '/bookings/:id/confirm-employee',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.confirmEmployee
);
router.put(
  '/bookings/:id/confirm-corporate',
  authenticate,
  requireCorporateAdmin,
  validate(bookingIdParamSchema, 'params'),
  corporateController.confirmCorporate
);
// Gộp Mức 1+2: admin xác nhận & chốt trong 1 bước, kèm chọn hình thức thanh toán.
router.put(
  '/bookings/:id/confirm-and-finalize',
  authenticate,
  requireCorporateAdmin,
  validate(bookingIdParamSchema, 'params'),
  validate(confirmAndFinalizeSchema, 'body'),
  corporateController.confirmAndFinalize
);
router.get(
  '/bookings/:id/cost-summary',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.costSummary
);

// ── ENT-Day 2: VAS on bookings ─────────────────────────────────────
router.post(
  '/bookings/:id/vas',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  validate(addBookingVasSchema, 'body'),
  corporateController.addBookingVas
);
router.delete(
  '/bookings/:id/vas/:vasId',
  authenticate,
  requireCorporateEmployee,
  validate(bookingVasParamSchema, 'params'),
  corporateController.removeBookingVas
);

// ── ENT-Day 3: SLA violations on bookings ───────────────────────────
router.post(
  '/bookings/:id/sla-violations',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  validate(reportViolationSchema, 'body'),
  corporateController.reportSlaViolation
);
router.get(
  '/bookings/:id/sla-violations',
  authenticate,
  requireCorporateEmployee,
  validate(bookingIdParamSchema, 'params'),
  corporateController.listBookingSlaViolations
);

// ── Settlements (Day 5) — Corporate Admin ───────────────────────────
router.get(
  '/settlements',
  authenticate,
  requireCorporateAdmin,
  validate(listSettlementsQuerySchema, 'query'),
  corporateController.listSettlementsCorporate
);
router.get(
  '/settlements/:id',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  corporateController.getSettlementCorporate
);
router.get(
  '/settlements/:id/qr',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  corporateController.getSettlementQrCorporate
);
router.put(
  '/settlements/:id/confirm',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  corporateController.confirmSettlement
);
router.put(
  '/settlements/:id/dispute',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  validate(disputeSettlementSchema, 'body'),
  corporateController.disputeSettlement
);

// Manual bank-transfer: corporate admin bấm "đã thanh toán" → báo admin OtoRent.
router.put(
  '/settlements/:id/declare-paid',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  corporateController.declareSettlementPaid
);
// Follow-up upload of the transfer-proof image (multipart field "image").
router.post(
  '/settlements/:id/proof',
  authenticate,
  requireCorporateAdmin,
  validate(settlementIdParamSchema, 'params'),
  uploadImage,
  handleUploadError,
  corporateController.uploadSettlementProof
);

// ── Dashboard & reports (Day 6) ─────────────────────────────────────
router.get(
  '/dashboard',
  authenticate,
  requireCorporateAdmin,
  validate(dashboardQuerySchema, 'query'),
  corporateController.corporateDashboard
);
router.get(
  '/reports/trips',
  authenticate,
  requireCorporateAdmin,
  validate(tripsReportQuerySchema, 'query'),
  corporateController.corporateTripsReport
);

export default router;
