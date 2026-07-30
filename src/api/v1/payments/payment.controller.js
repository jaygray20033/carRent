// src/api/v1/payments/payment.controller.js
import { paymentService } from './payment.service.js';
import { paymentService as checkoutService } from '../../../services/paymentService.js';
import { vnpayAdapter } from '../../../integrations/payments/index.js';
import { success, created } from '../../../utils/apiResponse.js';
import { env } from '../../../config/env.js';
import prisma from '../../../config/db.js';
import logger from '../../../config/logger.js';
// [DISABLED — SePay webhook, see commented sepayWebhook below] These were only
// used by the now-disabled SePay auto-reconcile handler.
// import { settlementService } from '../corporate/settlement.service.js';
// import { parseSettlementId } from '../../../services/vietqr.js';

export const paymentController = {
  checkout: async (req, res) => {
    const ipAddr =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const data = await paymentService.checkout(req.user.id, req.body, ipAddr);
    return created(res, data, 'Checkout session created');
  },

  listMine: async (req, res) => {
    const payments = await paymentService.listMine(req.user.id, req.query);
    return success(res, { payments });
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

  // [DISABLED — manual bank-transfer flow] Enterprise settlements are now paid via
  // a manual "báo đã thanh toán → upload ảnh → admin xác nhận" flow, so the SePay
  // auto-reconcile handler is no longer routed. Kept commented for reference.
  // // POST /payments/sepay/webhook — public bank-transfer callback (SePay servers).
  // // No user auth: authenticity is a shared secret in the Authorization header
  // // ("Apikey <SEPAY_WEBHOOK_SECRET>"). Only "in" transfers matter; we parse the
  // // settlement id out of the transfer content and let the service reconcile it.
  // // Always 200 on authenticated calls (even unmatched) so SePay won't retry a
  // // transfer we can't map — reconcile.matched=false is logged, not retried.
  // sepayWebhook: async (req, res) => {
  //   const secret = env.SEPAY_WEBHOOK_SECRET;
  //   const auth = req.headers.authorization || '';
  //   const provided = auth.replace(/^Apikey\s+/i, '').trim();
  //   if (!secret || provided !== secret) {
  //     logger.warn('SePay webhook rejected: bad or missing Apikey');
  //     return res.status(401).json({ success: false, message: 'Unauthorized' });
  //   }
  //
  //   const body = req.body || {};
  //   // Only incoming credits settle an invoice; ignore outgoing ("out") rows.
  //   if (body.transferType && body.transferType !== 'in') {
  //     return res.json({ success: true, matched: false, reason: 'NOT_INCOMING' });
  //   }
  //
  //   const content = body.content || body.description || '';
  //   const settlementId = parseSettlementId(content);
  //   const txnRef = body.referenceCode || (body.id != null ? `SEPAY-${body.id}` : null);
  //
  //   try {
  //     const result = await settlementService.reconcileByTransfer({
  //       settlementId,
  //       amount: body.transferAmount,
  //       txnRef,
  //     });
  //     return res.json({
  //       success: true,
  //       matched: result.matched,
  //       reason: result.reason,
  //       settlementId: result.settlement?.id ?? settlementId ?? null,
  //     });
  //   } catch (err) {
  //     logger.error(`SePay webhook error: ${err.message}`);
  //     return res.status(500).json({ success: false, message: 'Reconcile failed' });
  //   }
  // },
};
