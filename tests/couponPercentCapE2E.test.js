// tests/couponPercentCapE2E.test.js — Day 25 coupon cap e2e (UC-16/57)
//
// Spec: create a PERCENT 10% coupon with max_discount = 200k, apply it to a
// booking whose subtotal is large enough that 10% exceeds the cap, and assert
// the discount is clamped to 200k (not the raw 10%). Also assert that on a
// smaller subtotal the raw 10% applies (below the cap), and that the discount
// is persisted correctly on confirm.
//
// Strategy mirrors bookings.test.js: mint a JWT directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { settingsService } = await import('../src/services/settingsService.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// 1,500,000/day × 2 days = 3,000,000 base. subtotal now includes tax on base,
// so the coupon percentage is applied to (base + tax). At any positive tax rate
// 10% of the 2-day subtotal still exceeds the 200k cap → clamped.
const PRICE_PER_DAY = 1_500_000;
const CAP = 200_000;

// Pricing knobs are read from settings at runtime so expected numbers stay
// correct regardless of what tax_rate other suites may have written.
let pricing;
const withTax = (base) => base + Math.round((base * pricing.taxRate) / 100);

let customerRole;
let user;
let token;
let brand;
let vehicle;
let coupon;

// Two non-overlapping 2-day windows so the two bookings never collide.
const pickup1 = dayjs().add(1, 'day').second(0).millisecond(0);
const return1 = pickup1.add(2, 'day');
const pickup2 = dayjs().add(20, 'day').second(0).millisecond(0);
const return2 = pickup2.add(2, 'day');

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Coupon Cap Tester',
      phone: `06${stamp}00`.slice(0, 10),
      email: `couponcap_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  brand = await prisma.brand.upsert({
    where: { slug: `cap-brand-${stamp}` },
    update: {},
    create: { name: `CapBrand${stamp}`, slug: `cap-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Cap Test Car',
      slug: `cap-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88C-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      status: 'AVAILABLE',
    },
  });

  pricing = await settingsService.getPricingConfig();

  // PERCENT 10% capped at 200k, unlimited use so reruns don't hit the limit.
  coupon = await prisma.coupon.create({
    data: {
      code: `PCT10${stamp}`,
      type: 'PERCENT',
      value: 10,
      minOrder: 0,
      maxDiscount: CAP,
      maxUse: 0, // unlimited globally
      maxUsePerUser: 5,
      startAt: new Date('2024-01-01'),
      endAt: new Date('2030-12-31'),
      appliesTo: 'ALL',
      isActive: true,
    },
  });
});

afterAll(async () => {
  // FK-safe teardown: usages → bookings → coupon → vehicle → brand → user.
  await prisma.couponUsage.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { vehicleId: vehicle.id } }).catch(() => {});
  await prisma.coupon.delete({ where: { id: coupon.id } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

const createDraft = (pickup, ret) =>
  request(app)
    .post(`${BASE}/bookings/draft`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehicle.id,
      pickup_at: pickup.toISOString(),
      return_at: ret.toISOString(),
      pickup_point: 'OtoRent HQ',
      dropoff_point: 'OtoRent HQ',
    });

describe('Coupon PERCENT with max_discount cap (UC-16/57)', () => {
  let bookingId;

  it('creates a DRAFT with a 3,000,000 subtotal (no insurance)', async () => {
    const res = await createDraft(pickup1, return1);
    expect(res.status).toBe(201);
    const b = res.body.data;
    bookingId = b.id;
    expect(b.status).toBe('DRAFT');
    expect(b.totalDays).toBe(2);
    expect(b.subtotal).toBe(withTax(3_000_000));
    expect(b.couponDiscount).toBe(0);
  });

  it('validate: raw 10% (300,000) is clamped to the 200,000 cap', async () => {
    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: coupon.code, bookingId });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    // 10% of 3,000,000 = 300,000, but the coupon caps discount at 200,000.
    expect(res.body.data.discount).toBe(CAP);
    expect(res.body.data.coupon.code).toBe(coupon.code);
  });

  it('confirm: applies the capped 200,000 discount and persists a usage row', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ coupon_code: coupon.code });

    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(b.subtotal).toBe(withTax(3_000_000));
    expect(b.couponDiscount).toBe(CAP);
    expect(b.totalAmount).toBe(withTax(3_000_000) - CAP); // subtotal − capped discount

    const usage = await prisma.couponUsage.findFirst({
      where: { bookingId, userId: user.id, couponId: coupon.id },
    });
    expect(usage).not.toBeNull();
    expect(usage.discount).toBe(CAP);
  });
});

describe('Coupon PERCENT below the cap applies the raw percentage', () => {
  let smallBookingId;

  it('a 1-day booking (1,500,000) → 10% = 150,000, under the 200k cap', async () => {
    // 1-day window so subtotal = 1,500,000 → 10% = 150,000 < 200,000 cap.
    const res = await createDraft(pickup2, pickup2.add(1, 'day'));
    expect(res.status).toBe(201);
    const b = res.body.data;
    smallBookingId = b.id;
    expect(b.subtotal).toBe(withTax(1_500_000));

    const validateRes = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: coupon.code, bookingId: smallBookingId });

    expect(validateRes.status).toBe(200);
    // Raw 10% of the tax-inclusive subtotal, still below the 200,000 cap → not clamped.
    const rawDiscount = Math.round(withTax(1_500_000) * 0.1);
    expect(rawDiscount).toBeLessThan(CAP);
    expect(validateRes.body.data.discount).toBe(rawDiscount);
  });
});
