// src/api/v1/admin/bookings/adminBooking.routes.js
import { Router } from 'express';
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../../middlewares/rbac.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { adminBookingController } from './adminBooking.controller.js';
import { idParamSchema, adminRefundSchema } from './adminBooking.validator.js';

const router = Router();

// All admin booking routes require ADMIN or OPERATOR.
router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));

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
  validate(idParamSchema, 'params'),
  validate(adminRefundSchema, 'body'),
  asyncHandler(adminBookingController.refund)
);

export default router;
