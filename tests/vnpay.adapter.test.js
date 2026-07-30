// tests/vnpay.adapter.test.js — VNPay signature roundtrip (UC-18)
//
// Pure unit test: no DB, no network. We set the VNPay env BEFORE importing the
// adapter (env.js reads process.env once at import), then prove that:
//   1) createPayUrl produces a URL whose vnp_SecureHash verifies via verifyReturn
//   2) a tampered amount fails verification
//   3) a "00/00" callback is treated as success, other codes as failure
import crypto from 'node:crypto';
import querystring from 'node:querystring';

process.env.VNPAY_TMN_CODE = 'TESTTMN';
process.env.VNPAY_HASH_SECRET = 'TESTSECRETKEY';
process.env.VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNPAY_RETURN_URL = 'http://localhost:4000/api/v1/payments/vnpay/return';

const { vnpayAdapter } = await import('../src/integrations/payments/vnpay.adapter.js');

const HASH_SECRET = 'TESTSECRETKEY';

// Re-sign a param object the same way the adapter does (for crafting callbacks).
function buildSignedQuery(params) {
  const sorted = {};
  for (const k of Object.keys(params).sort()) {
    sorted[k] = encodeURIComponent(String(params[k])).replace(/%20/g, '+');
  }
  const signData = querystring.stringify(sorted, null, null, {
    encodeURIComponent: (v) => v,
  });
  const hash = crypto.createHmac('sha512', HASH_SECRET).update(Buffer.from(signData, 'utf-8')).digest('hex');
  return { ...sorted, vnp_SecureHash: hash };
}

describe('vnpayAdapter.createPayUrl', () => {
  it('produces a URL whose signature verifies', async () => {
    const { payUrl, txnRef } = await vnpayAdapter.createPayUrl({
      amount: 200000,
      txnRef: 'abc-123',
      orderInfo: 'Thanh toan don hang 1',
      ipAddr: '127.0.0.1',
    });

    expect(txnRef).toBe('abc-123');
    expect(payUrl).toContain('vnp_SecureHash=');
    expect(payUrl).toContain('vnp_Amount=20000000'); // 200000 * 100

    const query = querystring.parse(payUrl.split('?')[1]);
    const result = vnpayAdapter.verifyReturn(query);
    expect(result.valid).toBe(true);
    expect(result.txnRef).toBe('abc-123');
    expect(result.amount).toBe(200000);
  });
});

describe('vnpayAdapter.verify (return/ipn)', () => {
  it('accepts a valid 00/00 callback as success', () => {
    const query = buildSignedQuery({
      vnp_TxnRef: 'order-9',
      vnp_Amount: 50000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: 'VNP12345',
    });
    const result = vnpayAdapter.verifyIpn(query);
    expect(result.valid).toBe(true);
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('VNP12345');
  });

  it('rejects a tampered amount (signature mismatch)', () => {
    const query = buildSignedQuery({
      vnp_TxnRef: 'order-9',
      vnp_Amount: 50000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    query.vnp_Amount = 999999; // tamper after signing
    const result = vnpayAdapter.verifyReturn(query);
    expect(result.valid).toBe(false);
    expect(result.success).toBe(false);
  });

  it('treats a non-00 response code as a failed (but valid) callback', () => {
    const query = buildSignedQuery({
      vnp_TxnRef: 'order-9',
      vnp_Amount: 50000 * 100,
      vnp_ResponseCode: '24', // user cancelled
      vnp_TransactionStatus: '02',
    });
    const result = vnpayAdapter.verifyIpn(query);
    expect(result.valid).toBe(true);
    expect(result.success).toBe(false);
  });
});
