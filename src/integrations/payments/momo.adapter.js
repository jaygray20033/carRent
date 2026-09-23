// src/integrations/payments/momo.adapter.js
// Placeholder — MoMo integration is out of scope for Day 16/17.
import { AppError } from '../../utils/apiError.js';

function notImplemented() {
  throw new AppError('MoMo payment is not implemented yet', 501, 'NOT_IMPLEMENTED');
}

export const momoAdapter = {
  provider: 'MOMO',
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

export default momoAdapter;
