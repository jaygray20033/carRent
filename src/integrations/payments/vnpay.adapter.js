// src/integrations/payments/vnpay.adapter.js
// VNPay sandbox adapter (UC-18) — full integration.
//
//   createPayUrl  → build a signed redirect URL (sorted params + HMAC-SHA512).
//   verifyReturn  → verify the signature on the browser-return query string.
//   verifyIpn     → verify the signature on the server-to-server IPN query.
//
// Signing follows the VNPay spec: alphabetically sort the vnp_* params,
// URL-encode values (spaces → '+'), join as a querystring, HMAC-SHA512 with the
// merchant HashSecret, then attach the digest as vnp_SecureHash.
import crypto from 'node:crypto';
import querystring from 'node:querystring';
import dayjs from 'dayjs';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/apiError.js';

const VERSION = '2.1.0';

/** Alphabetically sort keys and URL-encode values (VNPay uses '+' for spaces). */
function sortObject(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = encodeURIComponent(String(obj[key])).replace(/%20/g, '+');
  }
  return sorted;
}

/** HMAC-SHA512 of an already-encoded querystring, using the merchant secret. */
function sign(signData) {
  return crypto
    .createHmac('sha512', env.VNPAY_HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
}

/**
 * Verify a VNPay callback (return or IPN). Recomputes the HMAC over every
 * param except the hash fields and compares it to vnp_SecureHash.
 * @returns {{ valid, txnRef, success, transactionId, responseCode, amount, raw }}
 */
function verifyCallback(query) {
  const received = query.vnp_SecureHash;
  const params = { ...query };
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const signData = querystring.stringify(sortObject(params), null, null, {
    encodeURIComponent: (v) => v, // values are already encoded by sortObject
  });
  const expected = sign(signData);

  const valid = received != null && received.toLowerCase() === expected.toLowerCase();
  // VNPay marks a payment successful only when both codes are '00'.
  const success =
    valid && query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';

  return {
    valid,
    success,
    txnRef: query.vnp_TxnRef,
    transactionId: query.vnp_TransactionNo,
    responseCode: query.vnp_ResponseCode,
    amount: query.vnp_Amount ? Number(query.vnp_Amount) / 100 : undefined,
    raw: query,
  };
}

export const vnpayAdapter = {
  provider: 'VNPAY',

  /**
   * Build the signed VNPay redirect URL.
   * @param {Object} p
   * @param {number} p.amount    - amount in VND (will be *100 for VNPay)
   * @param {string} p.txnRef    - unique transaction reference (UUID)
   * @param {string} p.orderInfo - human-readable description
   * @param {string} [p.ipAddr]  - client IP
   * @returns {{ payUrl: string, txnRef: string }}
   */
  async createPayUrl({ amount, txnRef, orderInfo, ipAddr }) {
    if (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET) {
      throw new AppError('VNPay is not configured (missing TmnCode/HashSecret)', 500, 'VNPAY_CONFIG');
    }

    const createDate = dayjs().format('YYYYMMDDHHmmss');
    const expireDate = dayjs().add(15, 'minute').format('YYYYMMDDHHmmss');

    const params = {
      vnp_Version: VERSION,
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: orderInfo || `Thanh toan ${txnRef}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(amount) * 100,
      vnp_ReturnUrl: env.VNPAY_RETURN_URL || `${env.APP_URL}/api/v1/payments/vnpay/return`,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    const sorted = sortObject(params);
    const signData = querystring.stringify(sorted, null, null, {
      encodeURIComponent: (v) => v,
    });
    sorted.vnp_SecureHash = sign(signData);

    const payUrl = `${env.VNPAY_URL}?${querystring.stringify(sorted, null, null, {
      encodeURIComponent: (v) => v,
    })}`;
    return { payUrl, txnRef };
  },

  /** Verify the browser-return query string. */
  verifyReturn(query) {
    return verifyCallback(query);
  },

  /** Verify the server-to-server IPN query. */
  verifyIpn(query) {
    return verifyCallback(query);
  },
};

export default vnpayAdapter;
