// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.routes.js
//  Day 12 — UC-16: Coupon routes
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { validateCoupon } from './coupon.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon validation (UC-16)
 *
 * /coupons/validate:
 *   post:
 *     tags: [Coupons]
 *     summary: Validate a coupon code against a DRAFT booking
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, bookingId]
 *             properties:
 *               code: { type: string, example: "WELCOME50K" }
 *               bookingId: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Coupon is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid: { type: boolean, example: true }
 *                     discount: { type: number, example: 50000 }
 *                     message: { type: string }
 *                     coupon:
 *                       type: object
 *                       properties:
 *                         id: { type: integer }
 *                         code: { type: string }
 *                         type: { type: string, enum: [FIXED, PERCENT, FREE_DRIVER] }
 *                         value: { type: number }
 *       400: { description: Coupon can only be applied to DRAFT bookings (NOT_DRAFT) }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 *       422: { description: "Coupon invalid / expired / usage limit reached (COUPON_INVALID)" }
 */
router.post('/validate', authenticate, validateCoupon);

export default router;
