// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.routes.js — Booking routes
//    UC-14 createDraft · UC-15 updateDraft · UC-16 confirm
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import {
  createDraft,
  updateDraft,
  confirmBooking,
  listMyBookings,
  getBookingDetail,
  cancelBooking,
} from './booking.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { reviewController } from '../reviews/review.controller.js';

const router = Router();

// All booking routes require authentication.
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Bookings
 *   description: Booking draft + hold flow (UC-14/15/16)
 *
 * components:
 *   schemas:
 *     BookingDraftInput:
 *       type: object
 *       required: [vehicleId, pickup_at, return_at, pickup_point, dropoff_point]
 *       properties:
 *         vehicleId: { type: integer, example: 1 }
 *         pickup_at: { type: string, format: date-time, description: "ISO datetime, must be ≥ 2h from now" }
 *         return_at: { type: string, format: date-time, description: "ISO datetime, must be after pickup_at" }
 *         pickup_point: { type: string, example: "CarGoGo HQ - Quận 2" }
 *         dropoff_point: { type: string, example: "Sân bay Tân Sơn Nhất" }
 *         rental_type: { type: string, enum: [SELF_DRIVE, WITH_DRIVER], default: SELF_DRIVE }
 *         premium_insurance: { type: boolean, default: false, description: "Apply the active PREMIUM insurance plan" }
 *     Booking:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         bookingCode: { type: string, example: "OTR-20260626-AB3K9" }
 *         status: { type: string, enum: [DRAFT, PENDING_PAYMENT, CONFIRMED, IN_USE, COMPLETED, CANCELLED, REFUNDED] }
 *         totalDays: { type: integer }
 *         pricePerDay: { type: number }
 *         subtotal: { type: number }
 *         insuranceFee: { type: number }
 *         couponDiscount: { type: number }
 *         totalAmount: { type: number }
 *         holdTtl: { type: integer, description: "Remaining Redis hold seconds (-1 if no Redis)" }
 */

/**
 * @swagger
 * /bookings/draft:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a DRAFT booking with a 15-min hold (UC-14)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BookingDraftInput' }
 *     responses:
 *       201: { description: Draft created }
 *       401: { description: Authentication required }
 *       404: { description: Vehicle not found }
 *       409: { description: "Vehicle unavailable / held / overlapping (codes BOOKING_OVERLAP, CAR_HELD, CAR_NOT_AVAILABLE)" }
 *       422: { description: Validation failed }
 */
router.post('/draft', createDraft);

/**
 * @swagger
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List the current user's bookings
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, PENDING_PAYMENT, CONFIRMED, IN_USE, COMPLETED, CANCELLED, REFUNDED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200: { description: Paginated bookings of the current user }
 *       401: { description: Authentication required }
 */
router.get('/', listMyBookings);

/**
 * @swagger
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking detail (owner / ADMIN / OPERATOR)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Booking detail with history + breakdown }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 */
router.get('/:id', getBookingDetail);

/**
 * @swagger
 * /bookings/{id}:
 *   patch:
 *     tags: [Bookings]
 *     summary: Update a DRAFT — insurance plan / dropoff — and recompute price (UC-15)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               insurancePlanId: { type: integer, nullable: true, description: "null clears the plan" }
 *               dropoffPoint: { type: string }
 *     responses:
 *       200: { description: Draft updated with recomputed pricing }
 *       400: { description: Booking is not in DRAFT status (NOT_DRAFT) }
 *       403: { description: Not your booking }
 *       404: { description: Booking or insurance plan not found }
 *       422: { description: Validation failed }
 */
router.patch('/:id', updateDraft);

/**
 * @swagger
 * /bookings/{id}/confirm:
 *   post:
 *     tags: [Bookings]
 *     summary: Confirm a DRAFT → PENDING_PAYMENT, optionally apply a coupon (UC-16)
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
 *               coupon_code: { type: string, example: "WELCOME50K" }
 *     responses:
 *       200: { description: Booking confirmed, awaiting payment }
 *       400: { description: Booking is not in DRAFT status (NOT_DRAFT) }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 *       422: { description: "Coupon invalid (COUPON_INVALID)" }
 */
router.post('/:id/confirm', confirmBooking);

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking + compute refund (UC-20) — DRAFT / PENDING_PAYMENT / CONFIRMED
 *     description: >
 *       Refund % is based on time to pickup (≥48h → 100%, 24-48h → 70%, <24h → 30%).
 *       WALLET payments are credited back immediately (status REFUNDED); VNPay/MoMo
 *       enqueue a provider refund job (refundStatus PENDING → REFUNDED on success).
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
 *     responses:
 *       200: { description: Booking cancelled with refund details (refundAmount, refundPercent, refundStatus) }
 *       400: { description: Cannot cancel in current status (CANNOT_CANCEL) }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 *       422: { description: Pickup time has passed (BOOKING_NOT_CANCELABLE) }
 */
router.post('/:id/cancel', cancelBooking);

/**
 * @swagger
 * /bookings/{id}/review:
 *   post:
 *     tags: [Bookings]
 *     summary: Review a vehicle after a completed rental (UC-50)
 *     description: Only the owner of a COMPLETED booking may review, and only once.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               content: { type: string }
 *               photos: { type: array, items: { type: string, format: uri } }
 *     responses:
 *       201: { description: Review submitted }
 *       400: { description: Booking is not COMPLETED (BOOKING_NOT_COMPLETED) }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 *       409: { description: Booking already reviewed (ALREADY_REVIEWED) }
 *       422: { description: Validation failed }
 */
router.post('/:id/review', asyncHandler(reviewController.create));

export default router;
