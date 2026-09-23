// tests/cancelRefund.test.js — Day 19 cancel + refund (UC-20)
//
// Covers:
//  - refund % at the 4 time windows (≥48h → 100, 24-48h → 70, <24h → 30, after pickup → 422)
//  - WALLET payment → balance credited immediately, booking REFUNDED
//  - VNPAY payment → refundStatus PENDING after cancel; settleExternalRefund → REFUNDED
//  - admin override → bypasses the time window
//
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { bookingService } = await import('../src/api/v1/bookings/booking.service.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
const PRICE_PER_DAY = 1_000_000;

let customerRole;
let adminRole;
let user;
let admin;
let token;
let adminToken;
let brand;
let vehicle;
let seq = 0;

// Create a CONFIRMED booking + a SUCCESS payment for the given method/window.
async function makePaidBooking({ hoursToPickup, method, amount = 2_000_000 }) {
  seq += 1;
  const pickupAt = dayjs().add(hoursToPickup, 'hour').toDate();
  const returnAt = dayjs(pickupAt).add(2, 'day').toDate();
  const booking = await prisma.booking.create({
    data: {
      bookingCode: `OTR-CR-${stamp}-${seq}`,
      userId: user.id,
      vehicleId: vehicle.id,
      rentalType: 'SELF_DRIVE',
      pickupAt,
      returnAt,
      totalDays: 2,
      pricePerDay: PRICE_PER_DAY,
      subtotal: amount,
      totalAmount: amount,
      status: 'CONFIRMED',
    },
  });
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      userId: user.id,
      type: 'BOOKING',
      method,
      amount,
      status: 'SUCCESS',
      txnRef: `txn-${stamp}-${seq}`,
      transactionId: `TX-${seq}`,
      paidAt: new Date(),
    },
  });
  return booking;
}

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng' },
  });
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Refund Tester',
      phone: `08${stamp}11`.slice(0, 10),
      email: `refund_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Refund Admin',
      phone: `08${stamp}22`.slice(0, 10),
      email: `refundadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);
  adminToken = signToken(admin.id);

  brand = await prisma.brand.upsert({
    where: { slug: `refund-brand-${stamp}` },
    update: {},
    create: { name: `RefundBrand${stamp}`, slug: `refund-brand-${stamp}` },
  });
  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Refund Car',
      slug: `refund-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88R-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      status: 'AVAILABLE',
    },
  });
});

afterAll(async () => {
  await prisma.walletTransaction.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { vehicleId: vehicle.id } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('UC-20 refund % at the 4 time windows (WALLET → inline refund)', () => {
  it('≥ 48h before pickup → 100% refund, REFUNDED, wallet credited', async () => {
    const booking = await makePaidBooking({ hoursToPickup: 72, method: 'WALLET' });
    const before = (await prisma.wallet.findUnique({ where: { userId: user.id } }))?.balance ?? 0;

    const res = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'changed plans' });

    expect(res.status).toBe(200);
    expect(res.body.data.refundPercent).toBe(100);
    expect(res.body.data.refundAmount).toBe(2_000_000);
    expect(res.body.data.refundStatus).toBe('REFUNDED');
    expect(res.body.data.status).toBe('REFUNDED');

    const after = (await prisma.wallet.findUnique({ where: { userId: user.id } })).balance;
    expect(after - before).toBe(2_000_000);

    const pay = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(pay.status).toBe('REFUNDED');
  });

  it('24–48h before pickup → 70% refund', async () => {
    const booking = await makePaidBooking({ hoursToPickup: 36, method: 'WALLET' });
    const res = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.refundPercent).toBe(70);
    expect(res.body.data.refundAmount).toBe(1_400_000);
    expect(res.body.data.status).toBe('REFUNDED');
  });

  it('< 24h before pickup → 30% refund', async () => {
    const booking = await makePaidBooking({ hoursToPickup: 6, method: 'WALLET' });
    const res = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.refundPercent).toBe(30);
    expect(res.body.data.refundAmount).toBe(600_000);
  });

  it('after pickup → 422 BOOKING_NOT_CANCELABLE', async () => {
    const booking = await makePaidBooking({ hoursToPickup: -2, method: 'WALLET' });
    const res = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BOOKING_NOT_CANCELABLE');

    const fresh = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(fresh.status).toBe('CONFIRMED'); // unchanged
  });
});

describe('VNPay refund → async job, settled by the worker', () => {
  it('cancel sets refundStatus PENDING and booking stays CANCELLED', async () => {
    const booking = await makePaidBooking({ hoursToPickup: 72, method: 'VNPAY' });
    const res = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.refundPercent).toBe(100);
    expect(res.body.data.refundStatus).toBe('PENDING');
    expect(res.body.data.status).toBe('CANCELLED');

    // Worker completes the provider refund → REFUNDED.
    const pay = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    const settled = await bookingService.settleExternalRefund(booking.id, pay.id, 'REFUND-OK');
    expect(settled.status).toBe('REFUNDED');
    expect(settled.refundStatus).toBe('REFUNDED');

    const freshPay = await prisma.payment.findUnique({ where: { id: pay.id } });
    expect(freshPay.status).toBe('REFUNDED');
  });
});

describe('Admin override refund — bypasses the time window', () => {
  it('admin refunds a post-pickup booking that the owner could not cancel', async () => {
    const booking = await makePaidBooking({ hoursToPickup: -5, method: 'WALLET' });

    // Owner is blocked.
    const blocked = await request(app)
      .post(`${BASE}/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(blocked.status).toBe(422);

    // Admin overrides with an explicit percent.
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${booking.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'goodwill', refundPercent: 50 });

    expect(res.status).toBe(200);
    expect(res.body.data.refundPercent).toBe(50);
    expect(res.body.data.refundAmount).toBe(1_000_000);
    expect(res.body.data.status).toBe('REFUNDED');
  });

  it('non-admin is forbidden on the admin refund route', async () => {
    const booking = await makePaidBooking({ hoursToPickup: 72, method: 'WALLET' });
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${booking.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});
