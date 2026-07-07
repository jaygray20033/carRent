// src/api/v1/payments/payment.routes.js
import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { checkoutSchema } from './payment.validator.js';

const router = Router();

/**
 * @swagger
 * /payments/checkout:
 *   post:
 *     tags: [Payments]
 *     summary: Create a payment for a booking (UC-18) — returns a VNPay URL or wallet result
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payment initiated }
 */
router.post(
  '/checkout',
  authenticate,
  validate(checkoutSchema),
  asyncHandler(paymentController.checkout)
);

/**
 * @swagger
 * /payments/vnpay/return:
 *   get:
 *     tags: [Payments]
 *     summary: VNPay browser-return callback (no auth)
 *     responses:
 *       200: { description: Payment result }
 */
// VNPay callbacks — NO auth (called by the browser redirect / VNPay servers).
router.get('/vnpay/return', asyncHandler(paymentController.vnpayReturn));
/**
 * @swagger
 * /payments/vnpay/ipn:
 *   get:
 *     tags: [Payments]
 *     summary: VNPay IPN (server-to-server, no auth)
 *     responses:
 *       200: { description: IPN acknowledged }
 */
router.get('/vnpay/ipn', asyncHandler(paymentController.vnpayIpn));
router.post('/vnpay/ipn', asyncHandler(paymentController.vnpayIpn));

/**
 * @swagger
 * /payments/me:
 *   get:
 *     tags: [Payments]
 *     summary: My payment history
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payments }
 */
// GET /payments/me — the signed-in user's payment history. MUST precede /:id.
router.get('/me', authenticate, asyncHandler(paymentController.listMine));

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Payment detail
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payment }
 */
router.get('/:id', authenticate, asyncHandler(paymentController.detail));

/**
 * @swagger
 * /payments/{id}/mock-confirm:
 *   post:
 *     tags: [Payments]
 *     summary: Dev-only — simulate a successful gateway callback
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payment marked paid }
 */
// Dev-only: simulate gateway success callback
router.post('/:id/mock-confirm', authenticate, asyncHandler(paymentController.mockConfirm));

export default router;
