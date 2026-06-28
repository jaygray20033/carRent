// src/integrations/payments/vnpay.adapter.js
// VNPay sandbox adapter.
//
// Day 16: skeleton only — createPayUrl returns a mock sandbox URL so the
// checkout flow is end-to-end testable. The real HMAC-SHA512 signing,
// verifyReturn and verifyIpn land in Day 17 (UC-18).
import { env } from '../../config/env.js';
import { AppError } from '../../utils/apiError.js';

const notReady = (fn) => {
  throw new AppError(
    `VNPay ${fn} is not implemented yet (Day 17)`,
    501,
    'NOT_IMPLEMENTED'
  );
};

export const vnpayAdapter = {
  provider: 'VNPAY',

  /**
   * Build the redirect URL the browser is sent to.
   * Day 16: mock URL keyed by txnRef. Day 17 replaces this with a signed
   * VNPay sandbox URL (sorted params + vnp_SecureHash HMAC-SHA512).
   *
   * @param {Object} p
   * @param {number} p.amount    - amount in VND
   * @param {string} p.txnRef    - unique transaction reference (UUID)
   * @param {string} p.orderInfo - human-readable description
   * @param {string} [p.ipAddr]  - client IP (required by VNPay in Day 17)
   * @returns {Promise<{payUrl: string, txnRef: string}>}
   */
  async createPayUrl({ amount, txnRef, orderInfo }) {
    const base = env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const params = new URLSearchParams({
      vnp_TmnCode: env.VNPAY_TMN_CODE || 'MOCK_TMN',
      vnp_Amount: String(amount * 100), // VNPay expects amount * 100
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: orderInfo || `Thanh toan ${txnRef}`,
      vnp_ReturnUrl: env.VNPAY_RETURN_URL || `${env.APP_URL}/api/v1/payments/vnpay/return`,
      mock: '1', // marker: this URL is not signed — dev only
    });
    return { payUrl: `${base}?${params.toString()}`, txnRef };
  },

  // Day 17 — verify signature of the browser redirect query string.
  verifyReturn() {
    return notReady('verifyReturn');
  },

  // Day 17 — verify the server-to-server IPN callback.
  verifyIpn() {
    return notReady('verifyIpn');
  },
};

export default vnpayAdapter;
