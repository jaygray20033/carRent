// tests/payments.test.js — Payment checkout + VNPay webhook + wallet-pay branches.
//
// Complements tests/vnpayIpn.test.js (which owns the VNPay checkout→IPN happy
// path). Here we focus on the payment.service / paymentService branches:
//   checkout guards (not-your-booking 403, wrong-status 400),
//   WALLET pay — insufficient balance (422) and sufficient (SUCCESS + booking
//     CONFIRMED + wallet debited + WalletTransaction row),
//   BANK_TRANSFER / CASH → PENDING payment, no redirect,
//   VNPay IPN — success confirms, failure (ResponseCode!=00) marks FAILED,
//     invalid signature → RspCode 97, unknown txnRef → RspCode 01,
//     duplicate success IPN is idempotent,
//   payment detail ownership guard (403 for another user's payment).
//
// Real MySQL, mocked ioredis (jest.config). VNPay env is set before app import
// so the adapter can sign/verify. Rate limiting isn't on /payments, so no need
// to disable it here.
import crypto from 'node:crypto';
import querystring from 'node:querystring';

// VNPay creds must exist before env.js is first read.
process.env.VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || 'TESTTMN';
process.env.VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || 'TESTSECRETKEY';
process.env.VNPAY_URL =
  process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNPAY_RETURN_URL =
  process.env.VNPAY_RETURN_URL || 'http://localhost:4000/api/v1/payments/vnpay/return';

const request = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const dayjs = (await import('dayjs')).default;
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const HASH_SECRET = process.env.VNPAY_HASH_SECRET;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Craft a VNPay-signed IPN payload (same signing scheme as the adapter).
function signedIpn(params) {
  const sorted = {};
  for (const k of Object.keys(params).sort()) {
    sorted[k] = encodeURIComponent(String(params[k])).replace(/%20/g, '+');
  }
  const signData = querystring.stringify(sorted, null, null, { encodeURIComponent: (v) => v });
  const hash = crypto
    .createHmac('sha512', HASH_SECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  return { ...params, vnp_SecureHash: hash };
}

let role;
let brand;
let vehicle;
let payer; // owns the bookings + a funded wallet
let payerToken;
let stranger; // used for the ownership-guard test
let strangerToken;
const bookingIds = [];
const createdBookingIds = [];

// Helper to create a fresh PENDING_PAYMENT booking owned by `payer`.
async function createPendingBooking(amount) {
  const pickup = dayjs().add(1, 'day').second(0).millisecond(0);
  const b = await prisma.booking.create({
    data: {
      bookingCode: `OTR-PAY-${stamp}-${createdBookingIds.length}`,
      userId: payer.id,
      vehicleId: vehicle.id,
      rentalType: 'SELF_DRIVE',
      pickupAt: pickup.toDate(),
      returnAt: pickup.add(2, 'day').toDate(),
      totalDays: 2,
      pricePerDay: amount / 2,
      subtotal: amount,
      totalAmount: amount,
      status: 'PENDING_PAYMENT',
      holdUntil: dayjs().add(15, 'minute').toDate(),
    },
  });
  createdBookingIds.push(b.id);
  bookingIds.push(b.id);
  return b;
}

beforeAll(async () => {
  role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng' },
  });

  payer = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Payment Payer',
      phone: `03${stamp}`.slice(0, 10),
      email: `payer_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  payerToken = signToken(payer.id);

  stranger = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Payment Stranger',
      phone: `04${stamp}`.slice(0, 10),
      email: `stranger_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  strangerToken = signToken(stranger.id);

  brand = await prisma.brand.upsert({
    where: { slug: `pay-brand-${stamp}` },
    update: {},
    create: { name: `PayBrand${stamp}`, slug: `pay-brand-${stamp}` },
  });
  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Payment Car',
      slug: `pay-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `99P-${stamp}`.slice(0, 15),
      pricePerDay: 1_000_000,
      status: 'AVAILABLE',
    },
  });
});

afterAll(async () => {
  // FK-safe: wallet txns → payments → booking history → bookings → wallet →
  // vehicle → brand → users.
  const userIds = [payer?.id, stranger?.id].filter(Boolean);
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { bookingId: { in: createdBookingIds } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.bookingHistory
    .deleteMany({ where: { bookingId: { in: createdBookingIds } } })
    .catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.vehicle
    .delete({ where: { id: vehicle.id } })
    .catch((e) => console.error('[payments.test cleanup] vehicle delete failed:', e.message));
  await prisma.brand
    .delete({ where: { id: brand.id } })
    .catch((e) => console.error('[payments.test cleanup] brand delete failed:', e.message));
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Payments — checkout guards', () => {
  it('returns 403 when checking out a booking that is not yours', async () => {
    const booking = await createPendingBooking(2_000_000);
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ bookingId: booking.id.toString(), method: 'VNPAY' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not your booking/i);
  });

  it('returns 400 INVALID_STATUS when the booking is not PENDING_PAYMENT', async () => {
    const booking = await createPendingBooking(2_000_000);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });

    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: booking.id.toString(), method: 'VNPAY' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS');
  });

  it('returns 404 for a non-existent booking', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: '99999999', method: 'VNPAY' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('requires authentication (401 without a token)', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .send({ bookingId: '1', method: 'VNPAY' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid method with 422 VALIDATION', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: '1', method: 'BITCOIN' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('Payments — BANK_TRANSFER / CASH (no redirect)', () => {
  it('creates a PENDING payment with no checkoutUrl for BANK_TRANSFER', async () => {
    const booking = await createPendingBooking(1_500_000);
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: booking.id.toString(), method: 'BANK_TRANSFER' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(res.body.data.payment.status).toBe('PENDING');
    expect(res.body.data.payment.method).toBe('BANK_TRANSFER');

    const dbPayment = await prisma.payment.findUnique({
      where: { id: res.body.data.payment.id },
    });
    expect(dbPayment.status).toBe('PENDING');
    expect(Number(dbPayment.amount)).toBe(1_500_000);
  });
});

describe('Payments — WALLET pay (UC-19)', () => {
  it('returns 422 INSUFFICIENT_BALANCE when the wallet cannot cover the booking', async () => {
    // Fresh wallet with 0 balance (created lazily / via topup nowhere yet).
    await prisma.wallet.upsert({
      where: { userId: payer.id },
      update: { balance: 0 },
      create: { userId: payer.id, balance: 0, currency: 'VND' },
    });
    const booking = await createPendingBooking(2_000_000);

    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: booking.id.toString(), method: 'WALLET' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');

    // Booking untouched, no successful payment created.
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b.status).toBe('PENDING_PAYMENT');
  });

  it('pays a booking from a funded wallet: SUCCESS, booking CONFIRMED, balance debited, txn logged', async () => {
    // Fund the wallet to exactly cover the amount to also assert balance→0.
    const amount = 2_000_000;
    await prisma.wallet.upsert({
      where: { userId: payer.id },
      update: { balance: amount },
      create: { userId: payer.id, balance: amount, currency: 'VND' },
    });
    const booking = await createPendingBooking(amount);

    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: booking.id.toString(), method: 'WALLET' });

    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(res.body.data.payment.status).toBe('SUCCESS');
    expect(res.body.data.payment.method).toBe('WALLET');

    // DB state: booking CONFIRMED, wallet debited to 0, a PAYMENT txn recorded.
    const confirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(confirmed.status).toBe('CONFIRMED');

    const wallet = await prisma.wallet.findUnique({ where: { userId: payer.id } });
    expect(Number(wallet.balance)).toBe(0);

    const txn = await prisma.walletTransaction.findFirst({
      where: { walletId: wallet.id, referenceType: 'BOOKING', referenceId: booking.id },
    });
    expect(txn).not.toBeNull();
    expect(txn.type).toBe('PAYMENT');
    expect(Number(txn.amount)).toBe(-amount); // debit
    expect(Number(txn.balanceAfter)).toBe(0);
  });
});

describe('Payments — VNPay IPN webhook branches', () => {
  let txnRef;
  let paidBooking;

  it('checkout (VNPAY) creates a PENDING payment with a payUrl + txnRef', async () => {
    paidBooking = await createPendingBooking(2_000_000);
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: paidBooking.id.toString(), method: 'VNPAY' });

    expect(res.status).toBe(201);
    expect(res.body.data.payUrl).toContain('vnp_SecureHash=');
    expect(res.body.data.txnRef).toBeTruthy();
    txnRef = res.body.data.txnRef;

    const payment = await prisma.payment.findUnique({ where: { txnRef } });
    expect(payment.status).toBe('PENDING');
  });

  it('rejects an IPN with a bad signature (RspCode 97), payment stays PENDING', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/vnpay/ipn`)
      .send({ vnp_TxnRef: txnRef, vnp_ResponseCode: '00', vnp_SecureHash: 'deadbeef' });
    expect(res.body.RspCode).toBe('97');

    const payment = await prisma.payment.findUnique({ where: { txnRef } });
    expect(payment.status).toBe('PENDING');
  });

  it('returns RspCode 01 for an unknown txnRef', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: `no-such-${stamp}`,
      vnp_Amount: 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('01');
  });

  it('valid success IPN confirms the booking + marks the payment SUCCESS', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: txnRef,
      vnp_Amount: 2_000_000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: `VNP-${stamp}`,
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('00');

    const booking = await prisma.booking.findUnique({ where: { id: paidBooking.id } });
    expect(booking.status).toBe('CONFIRMED');
    const payment = await prisma.payment.findUnique({ where: { txnRef } });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.transactionId).toBe(`VNP-${stamp}`);
  });

  it('is idempotent — a duplicate success IPN still returns 00, no extra payment row', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: txnRef,
      vnp_Amount: 2_000_000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: `VNP-${stamp}`,
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('00');

    const payments = await prisma.payment.findMany({ where: { txnRef } });
    expect(payments.length).toBe(1);
  });

  it('a failed-payment IPN (ResponseCode!=00) marks the payment FAILED, booking not confirmed', async () => {
    const failBooking = await createPendingBooking(2_000_000);
    const checkout = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${payerToken}`)
      .send({ bookingId: failBooking.id.toString(), method: 'VNPAY' });
    const failTxnRef = checkout.body.data.txnRef;

    const ipn = signedIpn({
      vnp_TxnRef: failTxnRef,
      vnp_Amount: 2_000_000 * 100,
      vnp_ResponseCode: '24', // user cancelled
      vnp_TransactionStatus: '02',
      vnp_TransactionNo: `VNP-FAIL-${stamp}`,
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    // Signature is valid, so handleWebhook runs → marks FAILED → RspCode 00.
    expect(res.body.RspCode).toBe('00');

    const payment = await prisma.payment.findUnique({ where: { txnRef: failTxnRef } });
    expect(payment.status).toBe('FAILED');
    const booking = await prisma.booking.findUnique({ where: { id: failBooking.id } });
    expect(booking.status).toBe('PENDING_PAYMENT'); // not confirmed
  });
});

describe('Payments — detail ownership guard', () => {
  it('returns 403 when fetching a payment that belongs to another user', async () => {
    // Reuse the confirmed VNPay payment (owned by payer).
    const payment = await prisma.payment.findFirst({
      where: { userId: payer.id, status: 'SUCCESS' },
    });
    expect(payment).not.toBeNull();

    const res = await request(app)
      .get(`${BASE}/payments/${payment.id}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not your payment/i);
  });

  it('lets the owner fetch their own payment', async () => {
    const payment = await prisma.payment.findFirst({
      where: { userId: payer.id, status: 'SUCCESS' },
    });
    const res = await request(app)
      .get(`${BASE}/payments/${payment.id}`)
      .set('Authorization', `Bearer ${payerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.payment.id).toBe(payment.id);
  });
});
