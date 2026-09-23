// src/integrations/payments/zalopay.adapter.js
// Placeholder — ZaloPay integration is out of scope for Day 16/17.
import { AppError } from '../../utils/apiError.js';

function notImplemented() {
  throw new AppError('ZaloPay payment is not implemented yet', 501, 'NOT_IMPLEMENTED');
}

export const zalopayAdapter = {
  provider: 'ZALOPAY',
  async createPayUrl() {
    return notImplemented();
  },
  verifyReturn() {
    return notImplemented();
  },
  verifyIpn() {
    return notImplemented();
  },
};

export default zalopayAdapter;
