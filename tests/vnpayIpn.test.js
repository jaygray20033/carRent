// tests/vnpayIpn.test.js — VNPay checkout → IPN → CONFIRMED flow (UC-18)
//
// End-to-end at the service/HTTP layer (real MySQL, mocked ioredis):
//   checkout (PENDING_PAYMENT booking) → craft a signed IPN → POST it →
//   assert RspCode '00', booking CONFIRMED, payment SUCCESS, and that a second
//   identical IPN is idempotent (still '00', no double-confirm).
import crypto from 'node:crypto';
import querystring from 'node:querystring';

// VNPay env must be set before importing app/adapter (env.js reads once).
process.env.VNPAY_TMN_CODE = 'TESTTMN';
process.env.VNPAY_HASH_SECRET = 'TESTSECRETKEY';
process.env.VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNPAY_RETURN_URL = 'http://localhost:4000/api/v1/payments/vnpay/return';

const request = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const dayjs = (await import('dayjs')).default;
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

function signedIpn(params) {
  const sorted = {};
  for (const k of Object.keys(params).sort()) {
    sorted[k] = encodeURIComponent(String(params[k])).replace(/%20/g, '+');
  }
  const signData = querystring.stringify(sorted, null, null, { encodeURIComponent: (v) => v });
  const hash = crypto
    .createHmac('sha512', 'TESTSECRETKEY')
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  return { ...params, vnp_SecureHash: hash };
}

let user;
let token;
let vehicle;
let booking;

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng' },
  });
  user = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'VNPay Tester',
      phone: `07${stamp}11`.slice(0, 10),
      email: `vnpay_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  const brand = await prisma.brand.upsert({
    where: { slug: `vnp-brand-${stamp}` },
    update: {},
    create: { name: `VnpBrand${stamp}`, slug: `vnp-brand-${stamp}` },
  });
  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'VNPay Car',
      slug: `vnp-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88V-${stamp}`,
      pricePerDay: 1_000_000,
      status: 'AVAILABLE',
    },
  });

  const pickup = dayjs().add(1, 'day').second(0).millisecond(0);
  booking = await prisma.booking.create({
    data: {
      bookingCode: `OTR-VNP-${stamp}`,
      userId: user.id,
      vehicleId: vehicle.id,
      rentalType: 'SELF_DRIVE',
      pickupAt: pickup.toDate(),
      returnAt: pickup.add(2, 'day').toDate(),
      totalDays: 2,
      pricePerDay: 1_000_000,
      subtotal: 2_000_000,
      totalAmount: 2_000_000,
      status: 'PENDING_PAYMENT',
      holdUntil: dayjs().add(15, 'minute').toDate(),
    },
  });
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { bookingId: booking.id } }).catch(() => {});
  await prisma.bookingHistory.deleteMany({ where: { bookingId: booking.id } }).catch(() => {});
  await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
  await prisma.vehicle
    .delete({ where: { id: vehicle.id } })
    .catch((e) => console.error('[vnpayIpn.test cleanup] vehicle delete failed:', e.message));
  await prisma.brand
    .delete({ where: { slug: `vnp-brand-${stamp}` } })
    .catch((e) => console.error('[vnpayIpn.test cleanup] brand delete failed:', e.message));
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('VNPay checkout + IPN (UC-18)', () => {
  let txnRef;

  it('checkout returns a payUrl and txnRef', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: booking.id.toString(), method: 'VNPAY' });

    expect(res.status).toBe(201);
    expect(res.body.data.payUrl).toContain('vnp_SecureHash=');
    expect(res.body.data.txnRef).toBeTruthy();
    txnRef = res.body.data.txnRef;
  });

  it('valid IPN confirms the booking and returns RspCode 00', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: txnRef,
      vnp_Amount: 2_000_000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: 'VNP-TEST-1',
    });

    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('00');

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(updated.status).toBe('CONFIRMED');
    const payment = await prisma.payment.findUnique({ where: { txnRef } });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.transactionId).toBe('VNP-TEST-1');
  });

  it('is idempotent — a duplicate IPN still returns 00 without re-confirming', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: txnRef,
      vnp_Amount: 2_000_000 * 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: 'VNP-TEST-1',
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('00');

    const payments = await prisma.payment.findMany({ where: { bookingId: booking.id } });
    expect(payments.length).toBe(1); // no duplicate payment row
  });

  it('rejects an IPN with a bad signature (RspCode 97)', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/vnpay/ipn`)
      .send({ vnp_TxnRef: txnRef, vnp_ResponseCode: '00', vnp_SecureHash: 'deadbeef' });
    expect(res.body.RspCode).toBe('97');
  });

  it('returns RspCode 01 for an unknown txnRef', async () => {
    const ipn = signedIpn({
      vnp_TxnRef: 'does-not-exist',
      vnp_Amount: 100,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    const res = await request(app).post(`${BASE}/payments/vnpay/ipn`).send(ipn);
    expect(res.body.RspCode).toBe('01');
  });
});
