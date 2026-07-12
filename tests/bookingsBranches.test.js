// tests/bookingsBranches.test.js — Booking business-rule branch coverage (Day 43.5, Group 2)
//
// Complements bookings.test.js (happy path) by exercising the guard branches:
//   - createDraft validation: pickup < now+2h, return before pickup
//   - createDraft: vehicle not found (404), vehicle not AVAILABLE (409 CAR_NOT_AVAILABLE)
//   - confirm/coupon: not-yet-valid, expired, below min-order, per-user usage exhausted
//   - updateDraft/confirm ownership + status guards (403 / 400 NOT_DRAFT)
//   - cancel: not-your-booking (403), cannot-cancel once IN_USE (400 CANNOT_CANCEL)
//
// Same harness as bookings.test.js: real MySQL via Prisma, JWT minted directly,
// RedisLockService in noop mode (empty REDIS_URL → hold always succeeds).
//
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const PRICE_PER_DAY = 1_000_000;

let customerRole;
let user;
let otherUser;
let token;
let otherToken;
let brand;
let vehicle;
let unavailableVehicle;

// A valid 2-day window well past the "≥2h from now" guard.
const pickup = dayjs().add(3, 'day').second(0).millisecond(0);
const ret = pickup.add(2, 'day');

const draftBody = (over = {}) => ({
  vehicleId: vehicle.id,
  pickup_at: pickup.toISOString(),
  return_at: ret.toISOString(),
  pickup_point: 'OtoRent HQ',
  dropoff_point: 'OtoRent HQ',
  ...over,
});

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Branch Tester',
      phone: `06${stamp}00`.slice(0, 10),
      email: `branch_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  otherUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Other Tester',
      phone: `05${stamp}00`.slice(0, 10),
      email: `other_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otherToken = signToken(otherUser.id);

  brand = await prisma.brand.upsert({
    where: { slug: `branch-brand-${stamp}` },
    update: {},
    create: { name: `BranchBrand${stamp}`, slug: `branch-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Branch Car',
      slug: `branch-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88T-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      status: 'AVAILABLE',
    },
  });

  unavailableVehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Maintenance Car',
      slug: `maint-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `77T-${stamp}`,
      pricePerDay: PRICE_PER_DAY,
      status: 'MAINTENANCE',
    },
  });
});

afterAll(async () => {
  await prisma.couponUsage.deleteMany({ where: { userId: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { vehicleId: { in: [vehicle.id, unavailableVehicle.id] } } }).catch(() => {});
  await prisma.coupon.deleteMany({ where: { code: { startsWith: `BR${stamp}` } } }).catch(() => {});
  await prisma.vehicle.deleteMany({ where: { id: { in: [vehicle.id, unavailableVehicle.id] } } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('POST /bookings/draft — validation guards', () => {
  it('rejects a pickup less than 2 hours from now with 422', async () => {
    const soon = dayjs().add(30, 'minute').second(0).millisecond(0);
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ pickup_at: soon.toISOString(), return_at: soon.add(2, 'day').toISOString() }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'pickup_at')).toBe(true);
  });

  it('rejects return_at before pickup_at with 422', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ return_at: pickup.subtract(1, 'hour').toISOString() }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'return_at')).toBe(true);
  });

  it('rejects an unauthenticated draft with 401', async () => {
    const res = await request(app).post(`${BASE}/bookings/draft`).send(draftBody());
    expect(res.status).toBe(401);
  });

  it('returns 404 when the vehicle does not exist', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ vehicleId: 99_999_999 }));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 409 CAR_NOT_AVAILABLE when the vehicle is under maintenance', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ vehicleId: unavailableVehicle.id }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAR_NOT_AVAILABLE');
  });
});

describe('Ownership + status guards on an existing DRAFT', () => {
  let bookingId;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody());
    expect(res.status).toBe(201);
    bookingId = res.body.data.id;
  });

  it('forbids another user from updating my DRAFT (403)', async () => {
    const res = await request(app)
      .patch(`${BASE}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ dropoffPoint: 'Hijack HQ' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('forbids another user from confirming my DRAFT (403)', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('rejects updateDraft with an empty body (422 — needs at least one field)', async () => {
    const res = await request(app)
      .patch(`${BASE}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('Coupon validation branches (422 COUPON_INVALID)', () => {
  let bookingId;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ pickup_at: pickup.add(20, 'day').toISOString(), return_at: pickup.add(22, 'day').toISOString() }));
    expect(res.status).toBe(201);
    bookingId = res.body.data.id;
  });

  it('rejects a coupon that has not reached its start date', async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `BR${stamp}FUT`,
        type: 'FIXED',
        value: 50_000,
        minOrder: 0,
        maxUse: 0,
        maxUsePerUser: 5,
        startAt: dayjs().add(30, 'day').toDate(),
        endAt: dayjs().add(60, 'day').toDate(),
        isActive: true,
      },
    });

    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: c.code, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('rejects an expired coupon', async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `BR${stamp}EXP`,
        type: 'FIXED',
        value: 50_000,
        minOrder: 0,
        maxUse: 0,
        maxUsePerUser: 5,
        startAt: dayjs().subtract(30, 'day').toDate(),
        endAt: dayjs().subtract(1, 'day').toDate(),
        isActive: true,
      },
    });

    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: c.code, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('rejects a coupon whose minOrder exceeds the subtotal', async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `BR${stamp}MIN`,
        type: 'FIXED',
        value: 50_000,
        minOrder: 999_000_000, // impossibly high
        maxUse: 0,
        maxUsePerUser: 5,
        startAt: dayjs().subtract(1, 'day').toDate(),
        endAt: dayjs().add(30, 'day').toDate(),
        isActive: true,
      },
    });

    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: c.code, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('rejects an inactive coupon', async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `BR${stamp}OFF`,
        type: 'FIXED',
        value: 50_000,
        minOrder: 0,
        maxUse: 0,
        maxUsePerUser: 5,
        startAt: dayjs().subtract(1, 'day').toDate(),
        endAt: dayjs().add(30, 'day').toDate(),
        isActive: false,
      },
    });

    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: c.code, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('rejects a per-user-exhausted coupon (maxUsePerUser reached)', async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `BR${stamp}USED`,
        type: 'FIXED',
        value: 50_000,
        minOrder: 0,
        maxUse: 0,
        maxUsePerUser: 1,
        startAt: dayjs().subtract(1, 'day').toDate(),
        endAt: dayjs().add(30, 'day').toDate(),
        isActive: true,
      },
    });
    // Pre-record a usage so the per-user counter is already at the limit.
    await prisma.couponUsage.create({
      data: { couponId: c.id, userId: user.id, bookingId, discount: 50_000 },
    });

    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: c.code, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('returns 422 COUPON_INVALID for a code that does not exist', async () => {
    const res = await request(app)
      .post(`${BASE}/coupons/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `BR${stamp}NOPE`, bookingId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });
});

describe('Cancel guards', () => {
  it('forbids cancelling a booking that is not mine (403)', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send(draftBody({ pickup_at: pickup.add(40, 'day').toISOString(), return_at: pickup.add(42, 'day').toISOString() }));
    expect(res.status).toBe(201);
    const bookingId = res.body.data.id;

    const cancel = await request(app)
      .post(`${BASE}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ reason: 'not mine' });

    expect(cancel.status).toBe(403);
    expect(cancel.body.code).toBe('FORBIDDEN');
  });

  it('rejects cancelling an IN_USE booking with 400 CANNOT_CANCEL', async () => {
    // Create a booking then force it to IN_USE directly in the DB.
    const b = await prisma.booking.create({
      data: {
        bookingCode: `OTR-CANCEL-${stamp}`,
        userId: user.id,
        vehicleId: vehicle.id,
        rentalType: 'SELF_DRIVE',
        pickupAt: pickup.add(50, 'day').toDate(),
        returnAt: pickup.add(52, 'day').toDate(),
        pickupPoint: 'HQ',
        dropoffPoint: 'HQ',
        totalDays: 2,
        pricePerDay: PRICE_PER_DAY,
        subtotal: 2 * PRICE_PER_DAY,
        insuranceFee: 0,
        couponDiscount: 0,
        totalAmount: 2 * PRICE_PER_DAY,
        status: 'IN_USE',
      },
    });

    const res = await request(app)
      .post(`${BASE}/bookings/${b.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'too late' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_CANCEL');
  });
});
