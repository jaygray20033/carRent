// tests/carsReviews.test.js — Cars search/filter + Reviews integration tests (Day 43.5, Group 1)
//
// Strategy (mirrors tests/bookings.test.js):
//  - ioredis → in-memory fake (jest.config moduleNameMapper); RedisLockService noop.
//  - Prisma talks to the real MySQL container.
//  - JWTs are minted directly instead of via register/login.
//  - Every row is stamped so re-runs never collide, and torn down in afterAll.
//
// Real API under test (differs from the todo's assumptions):
//   GET  /cars                    — filter + sort + pagination (default status AVAILABLE)
//   GET  /cars/:id                — detail
//   GET  /cars/:id/reviews        — public APPROVED reviews + ratingAvg
//   POST /bookings/:id/review     — create a review (owner + COMPLETED + once)
//
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let role;
let user;
let otherUser;
let token;
let otherToken;
let brandA;
let brandB;
let autoCar; // AVAILABLE, AUTO, 4 seats, 500k
let manualCar; // AVAILABLE, MANUAL, 7 seats, 900k
let retiredCar; // RETIRED — must be excluded from default list
let completedBooking; // owned by `user`, COMPLETED → reviewable
let pendingBooking; // owned by `user`, PENDING_PAYMENT → not reviewable

beforeAll(async () => {
  role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Cars Tester',
      phone: `06${stamp}00`.slice(0, 10),
      email: `cars_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  otherUser = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Other Tester',
      phone: `05${stamp}00`.slice(0, 10),
      email: `cars_other_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otherToken = signToken(otherUser.id);

  brandA = await prisma.brand.create({
    data: { name: `Alpha${stamp}`, slug: `alpha-${stamp}` },
  });
  brandB = await prisma.brand.create({
    data: { name: `Beta${stamp}`, slug: `beta-${stamp}` },
  });

  autoCar = await prisma.vehicle.create({
    data: {
      brandId: brandA.id,
      name: `AutoCar ${stamp}`,
      slug: `auto-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `51A-${stamp}`,
      pricePerDay: 500_000,
      seats: 4,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
  });

  manualCar = await prisma.vehicle.create({
    data: {
      brandId: brandB.id,
      name: `ManualCar ${stamp}`,
      slug: `manual-car-${stamp}`,
      modelYear: 2023,
      licensePlate: `51B-${stamp}`,
      pricePerDay: 900_000,
      seats: 7,
      transmission: 'MANUAL',
      fuelType: 'DIESEL',
      status: 'AVAILABLE',
    },
  });

  retiredCar = await prisma.vehicle.create({
    data: {
      brandId: brandA.id,
      name: `RetiredCar ${stamp}`,
      slug: `retired-car-${stamp}`,
      modelYear: 2020,
      licensePlate: `51C-${stamp}`,
      pricePerDay: 300_000,
      seats: 4,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      status: 'RETIRED',
    },
  });

  completedBooking = await prisma.booking.create({
    data: {
      bookingCode: `OTR-REV-${stamp}-C`,
      userId: user.id,
      vehicleId: autoCar.id,
      status: 'COMPLETED',
      pickupAt: new Date('2026-01-01T00:00:00Z'),
      returnAt: new Date('2026-01-03T00:00:00Z'),
      totalDays: 2,
      pricePerDay: 500_000,
      subtotal: 1_000_000,
      totalAmount: 1_000_000,
    },
  });

  pendingBooking = await prisma.booking.create({
    data: {
      bookingCode: `OTR-REV-${stamp}-P`,
      userId: user.id,
      vehicleId: manualCar.id,
      status: 'PENDING_PAYMENT',
      pickupAt: new Date('2026-02-01T00:00:00Z'),
      returnAt: new Date('2026-02-03T00:00:00Z'),
      totalDays: 2,
      pricePerDay: 900_000,
      subtotal: 1_800_000,
      totalAmount: 1_800_000,
    },
  });
});

afterAll(async () => {
  const vehicleIds = [autoCar.id, manualCar.id, retiredCar.id];
  await prisma.review.deleteMany({ where: { vehicleId: { in: vehicleIds } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { userId: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } }).catch(() => {});
  await prisma.brand.deleteMany({ where: { id: { in: [brandA.id, brandB.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('GET /cars — filter, sort, pagination (UC-10/UC-11)', () => {
  it('lists AVAILABLE cars with pagination meta and excludes RETIRED', async () => {
    const res = await request(app).get(`${BASE}/cars`).query({ q: stamp, limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 50 });

    const slugs = res.body.data.map((c) => c.slug);
    expect(slugs).toContain(autoCar.slug);
    expect(slugs).toContain(manualCar.slug);
    // RETIRED must never appear in the default (AVAILABLE-only) listing.
    expect(slugs).not.toContain(retiredCar.slug);
  });

  it('filters by brandId independently', async () => {
    const res = await request(app).get(`${BASE}/cars`).query({ brandId: brandB.id, limit: 50 });
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c) => c.slug);
    expect(slugs).toContain(manualCar.slug);
    expect(slugs).not.toContain(autoCar.slug);
  });

  it('filters by transmission independently', async () => {
    const res = await request(app)
      .get(`${BASE}/cars`)
      .query({ transmission: 'MANUAL', q: stamp, limit: 50 });
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c) => c.slug);
    expect(slugs).toContain(manualCar.slug);
    expect(slugs).not.toContain(autoCar.slug);
  });

  it('combines brandId + transmission + seats (intersection)', async () => {
    const res = await request(app)
      .get(`${BASE}/cars`)
      .query({ brandId: brandB.id, transmission: 'MANUAL', seats: 7, limit: 50 });
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c) => c.slug);
    expect(slugs).toEqual([manualCar.slug]);
  });

  it('sorts price_asc → cheaper car comes before the pricier one', async () => {
    const res = await request(app)
      .get(`${BASE}/cars`)
      .query({ q: stamp, sort: 'price_asc', limit: 50 });
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c) => c.slug);
    const autoIdx = slugs.indexOf(autoCar.slug); // 500k
    const manualIdx = slugs.indexOf(manualCar.slug); // 900k
    expect(autoIdx).toBeGreaterThanOrEqual(0);
    expect(manualIdx).toBeGreaterThanOrEqual(0);
    expect(autoIdx).toBeLessThan(manualIdx);
  });

  it('sorts price_desc → pricier car comes first', async () => {
    const res = await request(app)
      .get(`${BASE}/cars`)
      .query({ q: stamp, sort: 'price_desc', limit: 50 });
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c) => c.slug);
    expect(slugs.indexOf(manualCar.slug)).toBeLessThan(slugs.indexOf(autoCar.slug));
  });

  it('rejects an invalid transmission enum with 422 VALIDATION', async () => {
    const res = await request(app).get(`${BASE}/cars`).query({ transmission: 'ROCKET' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('GET /cars/:id — detail', () => {
  it('returns the vehicle detail for a numeric id', async () => {
    const res = await request(app).get(`${BASE}/cars/${autoCar.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.car.id).toBe(autoCar.id);
    expect(res.body.data.car.slug).toBe(autoCar.slug);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app).get(`${BASE}/cars/99999999`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /bookings/:id/review — create review (UC-50)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${completedBooking.id}/review`)
      .send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it('rejects rating out of the 1-5 range with 422', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${completedBooking.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 9 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('rejects reviewing a booking that is not COMPLETED with 400 BOOKING_NOT_COMPLETED', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${pendingBooking.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BOOKING_NOT_COMPLETED');
  });

  it("rejects reviewing another user's booking with 403", async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${completedBooking.id}/review`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 4 });
    expect(res.status).toBe(403);
  });

  it('creates a review on a COMPLETED booking and recomputes the vehicle rating', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${completedBooking.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, content: 'Great car' });

    expect(res.status).toBe(201);
    expect(res.body.data.review.rating).toBe(4);
    expect(res.body.data.review.status).toBe('APPROVED');

    // Vehicle aggregate must reflect the new APPROVED review.
    const v = await prisma.vehicle.findUnique({ where: { id: autoCar.id } });
    expect(v.reviewCount).toBe(1);
    expect(Number(v.rating)).toBe(4);
  });

  it('rejects a second review for the same booking with 409 ALREADY_REVIEWED', async () => {
    const res = await request(app)
      .post(`${BASE}/bookings/${completedBooking.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REVIEWED');
  });
});

describe('GET /cars/:id/reviews — public list + average', () => {
  it('lists the APPROVED review with correct pagination meta and ratingAvg', async () => {
    const res = await request(app).get(`${BASE}/cars/${autoCar.id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].rating).toBe(4);
    // Reviewer identity is attached without a Prisma relation.
    expect(res.body.data[0].user?.fullName).toBe('Cars Tester');
  });
});
