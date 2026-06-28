// src/api/v1/payments/payment.controller.js
import { paymentService } from './payment.service.js';
import { paymentService as checkoutService } from '../../../services/paymentService.js';
import { vnpayAdapter } from '../../../integrations/payments/index.js';
import { success, created } from '../../../utils/apiResponse.js';
import { env } from '../../../config/env.js';
import prisma from '../../../config/db.js';
import logger from '../../../config/logger.js';

export const paymentController = {
  checkout: async (req, res) => {
    const ipAddr =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const data = await paymentService.checkout(req.user.id, req.body, ipAddr);
    return created(res, data, 'Checkout session created');
  },

  detail: async (req, res) => {
    const payment = await paymentService.getById(req.user.id, req.params.id);
    return success(res, { payment });
  },

  mockConfirm: async (req, res) => {
    const data = await paymentService.confirmSuccess(
      req.params.id,
      req.body.transactionId || `MOCK-${Date.now()}`,
      req.body
    );
    return success(res, { payment: data }, 'Payment confirmed (mock)');
  },

  // GET /payments/vnpay/return — browser redirect after the VNPay page.
  // We only verify the signature here for UX; the IPN is the source of truth.
  vnpayReturn: async (req, res) => {
    const result = vnpayAdapter.verifyReturn(req.query);
    const status = result.valid ? (result.success ? 'success' : 'failed') : 'invalid';

    // Look up the payment so the result page can deep-link to the booking.
    let bookingId = '';
    if (result.txnRef) {
      const payment = await prisma.payment.findUnique({ where: { txnRef: result.txnRef } });
      if (payment?.bookingId) bookingId = String(payment.bookingId);
    }

    const params = new URLSearchParams({
      status,
      txnRef: result.txnRef || '',
      ...(bookingId ? { bookingId } : {}),
    });
    return res.redirect(`${env.FRONTEND_URL}/payment/result?${params.toString()}`);
  },

  // POST/GET /payments/vnpay/ipn — server-to-server callback (source of truth).
  // Always responds with VNPay's expected { RspCode, Message } shape.
  vnpayIpn: async (req, res) => {
    const query = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
    try {
      const result = vnpayAdapter.verifyReturn(query);
      if (!result.valid) {
        return res.json({ RspCode: '97', Message: 'Invalid signature' });
      }
      await checkoutService.handleWebhook('VNPAY', query);
      // Idempotent + success path both return '00' per the VNPay spec.
      return res.json({ RspCode: '00', Message: 'Confirm Success' });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return res.json({ RspCode: '01', Message: 'Order not found' });
      }
      logger.error(`VNPay IPN error: ${err.message}`);
      return res.json({ RspCode: '99', Message: 'Unknown error' });
    }
  },
};
