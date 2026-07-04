// src/api/v1/admin/bookings/adminBooking.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminBookingController } from './adminBooking.controller.js';
import { idParamSchema, adminRefundSchema, returnBookingSchema } from './adminBooking.validator.js';

const router = Router();

// Refund stays ADMIN/OPERATOR; the handover actions (start/return) also allow
// AGENT, gated per-route below.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR', 'AGENT']));

// Refund is not an agent action.
const NO_AGENT = requireRole(['ADMIN', 'OPERATOR']);
const HANDOVER = requireRole(['ADMIN', 'OPERATOR', 'AGENT']);

/**
 * @swagger
 * /admin/bookings/{id}/refund:
 *   post:
 *     tags: [Admin - Bookings]
 *     summary: Admin override refund (UC-20) — bypasses the cancellation time window
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *               refundPercent: { type: integer, minimum: 0, maximum: 100, default: 100 }
 *     responses:
 *       200: { description: Booking refunded (CANCELLED/REFUNDED with refund details) }
 *       400: { description: Booking already cancelled (CANNOT_CANCEL) }
 *       403: { description: Insufficient permissions }
 *       404: { description: Booking not found }
 */
router.post(
  '/:id/refund',
  NO_AGENT,
  validate(idParamSchema, 'params'),
  validate(adminRefundSchema, 'body'),
  asyncHandler(adminBookingController.refund)
);

/**
 * @swagger
 * /admin/bookings/{id}/start:
 *   post:
 *     tags: [Admin - Bookings]
 *     summary: Day 30 — start the rental at handover (CONFIRMED → IN_USE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Booking started (IN_USE, actualPickupAt stamped) }
 *       400: { description: Booking not in CONFIRMED status (BOOKING_NOT_STARTABLE) }
 *       403: { description: Insufficient permissions }
 *       404: { description: Booking not found }
 */
router.post(
  '/:id/start',
  HANDOVER,
  validate(idParamSchema, 'params'),
  asyncHandler(adminBookingController.start)
);

/**
 * @swagger
 * /admin/bookings/{id}/return:
 *   post:
 *     tags: [Admin - Bookings]
 *     summary: Day 30 — close out the rental on return (IN_USE → COMPLETED)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               extraFee: { type: integer, minimum: 0, description: fuel / charging / damage fee }
 *               note: { type: string }
 *     responses:
 *       200: { description: Booking completed (actualReturnAt + extraFee), review notification sent }
 *       400: { description: Booking not in IN_USE status (BOOKING_NOT_RETURNABLE) }
 *       403: { description: Insufficient permissions }
 *       404: { description: Booking not found }
 */
router.post(
  '/:id/return',
  HANDOVER,
  validate(idParamSchema, 'params'),
  validate(returnBookingSchema, 'body'),
  asyncHandler(adminBookingController.return)
);

export default router;
