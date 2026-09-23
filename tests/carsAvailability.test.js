// tests/carsAvailability.test.js — GET /cars/:id/availability (Day 10, UC-08)
//
// Strategy (mirrors tests/carsReviews.test.js):
//  - ioredis → in-memory fake (jest.config moduleNameMapper); RedisLockService noop.
//  - Prisma talks to the real MySQL container.
//  - Every row is stamped so re-runs never collide, and torn down in afterAll.
//
// Endpoint under test:
//   GET /cars/:id/availability?from=&to=
//     → { periods: [{ from, to, status }] } — booked intervals that still
//       occupy the vehicle. CONFIRMED / IN_USE always count; DRAFT /
//       PENDING_PAYMENT only while holdUntil is in the future.
//
import request from 'supertest';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + DAY);
const past = new Date(Date.now() - DAY);

let role;
let user;
let brand;
let car;
let confirmedBooking; // CONFIRMED — always occupies
let liveDraft; // DRAFT, holdUntil in the future — occupies
let expiredDraft; // DRAFT, holdUntil in the past — must NOT occupy
let cancelledBooking; // CANCELLED — must NOT occupy

const mkBooking = (data) =>
  prisma.booking.create({
    data: {
      userId: user.id,
      vehicleId: car.id,
      totalDays: 2,
      pricePerDay: 500_000,
      subtotal: 1_000_000,
      totalAmount: 1_000_000,
      ...data,
    },
  });

beforeAll(async () => {
  role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Avail Tester',
      phone: `07${stamp}00`.slice(0, 10),
      email: `avail_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  brand = await prisma.brand.create({
    data: { name: `Avail${stamp}`, slug: `avail-${stamp}` },
  });

  car = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: `AvailCar ${stamp}`,
      slug: `avail-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `51V-${stamp}`,
      pricePerDay: 500_000,
      seats: 4,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
  });

  // CONFIRMED: 2026-03-01 → 2026-03-03
  confirmedBooking = await mkBooking({
    bookingCode: `OTR-AVL-${stamp}-C`,
    status: 'CONFIRMED',
    pickupAt: new Date('2026-03-01T00:00:00Z'),
    returnAt: new Date('2026-03-03T00:00:00Z'),
  });

  // Live DRAFT: 2026-03-10 → 2026-03-12, hold still active
  liveDraft = await mkBooking({
    bookingCode: `OTR-AVL-${stamp}-D`,
    status: 'DRAFT',
    pickupAt: new Date('2026-03-10T00:00:00Z'),
    returnAt: new Date('2026-03-12T00:00:00Z'),
    holdUntil: future,
  });

  // Expired DRAFT: 2026-03-20 → 2026-03-22, hold already lapsed
  expiredDraft = await mkBooking({
    bookingCode: `OTR-AVL-${stamp}-E`,
    status: 'DRAFT',
    pickupAt: new Date('2026-03-20T00:00:00Z'),
    returnAt: new Date('2026-03-22T00:00:00Z'),
    holdUntil: past,
  });

  // CANCELLED: 2026-03-25 → 2026-03-27
  cancelledBooking = await mkBooking({
    bookingCode: `OTR-AVL-${stamp}-X`,
    status: 'CANCELLED',
    pickupAt: new Date('2026-03-25T00:00:00Z'),
    returnAt: new Date('2026-03-27T00:00:00Z'),
  });
});

afterAll(async () => {
  await prisma.booking
    .deleteMany({
      where: {
        id: {
          in: [confirmedBooking.id, liveDraft.id, expiredDraft.id, cancelledBooking.id],
        },
      },
    })
    .catch(() => {});
  await prisma.vehicle.deleteMany({ where: { id: car.id } }).catch(() => {});
  await prisma.brand.deleteMany({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('GET /cars/:id/availability', () => {
  it('returns CONFIRMED and live-DRAFT periods, excludes expired-DRAFT and CANCELLED', async () => {
    const res = await request(app).get(`${BASE}/cars/${car.id}/availability`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const periods = res.body.data.periods;
    expect(Array.isArray(periods)).toBe(true);

    const starts = periods.map((p) => new Date(p.from).toISOString());
    expect(starts).toContain('2026-03-01T00:00:00.000Z'); // CONFIRMED
    expect(starts).toContain('2026-03-10T00:00:00.000Z'); // live DRAFT
    expect(starts).not.toContain('2026-03-20T00:00:00.000Z'); // expired DRAFT
    expect(starts).not.toContain('2026-03-25T00:00:00.000Z'); // CANCELLED
  });

  it('filters to the [from, to) window', async () => {
    const res = await request(app)
      .get(`${BASE}/cars/${car.id}/availability`)
      .query({ from: '2026-03-05T00:00:00Z', to: '2026-03-15T00:00:00Z' });

    expect(res.status).toBe(200);
    const starts = res.body.data.periods.map((p) => new Date(p.from).toISOString());
    // Only the live DRAFT (03-10 → 03-12) overlaps this window.
    expect(starts).toContain('2026-03-10T00:00:00.000Z');
    expect(starts).not.toContain('2026-03-01T00:00:00.000Z'); // CONFIRMED ends 03-03, before window
  });

  it('returns 404 for a non-existent vehicle', async () => {
    const res = await request(app).get(`${BASE}/cars/99999999/availability`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejects to <= from with 422 VALIDATION', async () => {
    const res = await request(app)
      .get(`${BASE}/cars/${car.id}/availability`)
      .query({ from: '2026-03-10T00:00:00Z', to: '2026-03-05T00:00:00Z' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});
