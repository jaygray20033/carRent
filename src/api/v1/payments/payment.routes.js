// src/api/v1/payments/payment.routes.js
import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { checkoutSchema } from './payment.validator.js';

const router = Router();

router.post(
  '/checkout',
  authenticate,
  validate(checkoutSchema),
  asyncHandler(paymentController.checkout)
);

// VNPay callbacks — NO auth (called by the browser redirect / VNPay servers).
router.get('/vnpay/return', asyncHandler(paymentController.vnpayReturn));
router.get('/vnpay/ipn', asyncHandler(paymentController.vnpayIpn));
router.post('/vnpay/ipn', asyncHandler(paymentController.vnpayIpn));

router.get('/:id', authenticate, asyncHandler(paymentController.detail));

// Dev-only: simulate gateway success callback
router.post('/:id/mock-confirm', authenticate, asyncHandler(paymentController.mockConfirm));

export default router;
