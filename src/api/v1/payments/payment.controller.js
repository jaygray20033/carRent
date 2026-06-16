// src/api/v1/payments/payment.controller.js
import { paymentService } from './payment.service.js';
import { success, created } from '../../../utils/apiResponse.js';

export const paymentController = {
  checkout: async (req, res) => {
    const data = await paymentService.checkout(req.user.id, req.body);
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
};
