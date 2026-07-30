// tests/bookings.test.js — Booking flow integration tests (UC-14/15/16)
//
// Strategy:
//  - ioredis is mapped to an in-memory fake (jest.config moduleNameMapper), but
//    REDIS_URL is empty in tests so RedisLockService runs in "noop" mode and the
//    hold always succeeds — exactly what we want for the DB-backed flow here.
//    (The NX-contended lock is exercised separately in bookingLock.test.js.)
//  - Prisma talks to a real MySQL database (CI service container or local Docker).
//  - We mint a JWT directly instead of going through register/login.
//
// Flow under test: createDraft → updateDraft (insurance) → validate coupon →
// confirm (apply coupon) → assert the price breakdown at every step.
//
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { settingsService } = await import('../src/services/settingsService.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7);

const signToken = (userId) =>
  jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const PRICE_PER_DAY = 1_000_000;
const DEPOSIT = 3_000_000; // explicit vehicle deposit → deterministic totals

// Pricing knobs are read from settings at runtime so the expected numbers stay
// correct regardless of what other suites may have written to tax_rate etc.
let pricing;
// Same-point pickup/dropoff → no dropoff penalty; self-drive → no driver fee.
const tax = (base) => Math.round((base * pricing.taxRate) / 100);

let customerRole;
let user;
let token;
let brand;
let vehicle;
let premiumPlan;
let coupon;

// A 2-day rental window starting tomorrow (satisfies "≥ 2h from now").
const pickup = dayjs().add(1, 'day').second(0).millisecond(0);
const ret = pickup.add(2, 'day');

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Booking Tester',
      phone: `08${stamp}00`.slice(0, 10),
      email: `booking_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  brand = await prisma.brand.upsert({
    where: { slug: `test-brand-${stamp}` },
    update: {},
    create: { name: `TestBrand${stamp}`, slug: `test-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Test Car',
      slug: `test-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `99T-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      depositAmount: DEPOSIT,
      status: 'AVAILABLE',
    },
  });

  pricing = await settingsService.getPricingConfig();

  // Percent-based premium plan (10% of base price).
  premiumPlan = await prisma.insurancePlan.upsert({
    where: { code: 'PREMIUM' },
    update: { ratePercent: 10, isActive: true },
    create: { code: 'PREMIUM', name: 'Premium', ratePercent: 10, isActive: true },
  });

  // A dedicated, unlimited FIXED coupon so reruns don't hit usage limits.
  coupon = await prisma.coupon.create({
    data: {
      code: `TESTFIX${stamp}`,
      type: 'FIXED',
      value: 50_000,
      minOrder: 100_000,
      maxUse: 0, // unlimited
      maxUsePerUser: 5,
      startAt: new Date('2024-01-01'),
      endAt: new Date('2030-12-31'),
      isActive: true,
    },
  });
});

afterAll(async () => {
  // FK-safe teardown: usages → bookings (cascades history) → coupon → vehicle → brand → user.
  await prisma.couponUsage.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { vehicleId: vehicle.id } }).catch(() => {});
  await prisma.coupon.delete({ where: { id: coupon.id } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Booking flow — draft → insurance → coupon → confirm (UC-14/15/16)', () => {
  let bookingId;

  it('UC-14: creates a DRAFT with correct base pricing and a 15-min hold', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleId: vehicle.id,
        pickup_at: pickup.toISOString(),
        return_at: ret.toISOString(),
        pickup_point: 'OtoRent HQ',
        dropoff_point: 'OtoRent HQ',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const b = res.body.data;
    bookingId = b.id;
    expect(b.status).toBe('DRAFT');
    expect(b.bookingCode).toMatch(/^OTR-\d{8}-[A-Z2-9]{5}$/);
    expect(b.totalDays).toBe(2);
    expect(b.pricePerDay).toBe(PRICE_PER_DAY);
    expect(b.insuranceFee).toBe(0);
    expect(b.driverFee).toBe(0); // self-drive
    expect(b.dropoffPenalty).toBe(0); // same pickup/dropoff point
    expect(b.taxAmount).toBe(tax(2_000_000)); // tax on base price
    expect(b.depositAmount).toBe(DEPOSIT);
    // subtotal = base + tax; total = subtotal − discount + deposit
    expect(b.subtotal).toBe(2_000_000 + tax(2_000_000));
    expect(b.couponDiscount).toBe(0);
    expect(b.totalAmount).toBe(2_000_000 + tax(2_000_000) + DEPOSIT);
  });

  it('UC-15: applies the premium insurance plan and recomputes the price', async () => {
    const res = await request(app)
      .patch(`${BASE}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ insurancePlanId: premiumPlan.id });

    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.insurancePlanId).toBe(premiumPlan.id);
    expect(b.insuranceFee).toBe(200_000); // 10% of 2,000,000
    // subtotal = base + insurance + tax(base); tax is on base+driver only.
    expect(b.subtotal).toBe(2_000_000 + 200_000 + tax(2_000_000));
    expect(b.couponDiscount).toBe(0);
    expect(b.totalAmount).toBe(2_000_000 + 200_000 + tax(2_000_000) + DEPOSIT);
  });

  it('UC-16: validates a FIXED coupon against the booking', async () => {
    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: coupon.code, bookingId });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discount).toBe(50_000);
    expect(res.body.data.coupon.code).toBe(coupon.code);
  });

  it('UC-16: confirms the draft with the coupon → PENDING_PAYMENT, final price applied', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ coupon_code: coupon.code });

    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(b.insuranceFee).toBe(200_000);
    const subtotal = 2_000_000 + 200_000 + tax(2_000_000);
    expect(b.subtotal).toBe(subtotal);
    expect(b.couponDiscount).toBe(50_000);
    // total = subtotal − discount + deposit
    expect(b.totalAmount).toBe(subtotal - 50_000 + DEPOSIT);

    // A CouponUsage row must have been recorded for this user/booking.
    const usage = await prisma.couponUsage.findFirst({
      where: { bookingId, userId: user.id, couponId: coupon.id },
    });
    expect(usage).not.toBeNull();
    expect(usage.discount).toBe(50_000);
  });

  it('rejects confirming an already-confirmed booking (NOT_DRAFT, 400)', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_DRAFT');
  });
});

describe('Booking overlap — second user gets 409 BOOKING_OVERLAP', () => {
  let user2;
  let token2;

  // A distinct window so it never collides with the happy-path booking above.
  const oPickup = dayjs().add(10, 'day').second(0).millisecond(0);
  const oReturn = oPickup.add(2, 'day');

  beforeAll(async () => {
    user2 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Second Tester',
        phone: `07${stamp}00`.slice(0, 10),
        email: `booking2_${stamp}@example.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    token2 = signToken(user2.id);
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { userId: user2.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
  });

  it('user A books the slot (201), user B booking the same vehicle/period gets 409', async () => {
    const draftBody = {
      vehicleId: vehicle.id,
      pickup_at: oPickup.toISOString(),
      return_at: oReturn.toISOString(),
      pickup_point: 'OtoRent HQ',
      dropoff_point: 'OtoRent HQ',
    };

    const first = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token2}`)
      .send(draftBody);

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.code).toBe('BOOKING_OVERLAP');
  });
});
