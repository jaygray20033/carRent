// tests/adminDashboard.test.js — Day 31 admin dashboard KPIs (UC-52)
//
// Spec (GET /admin/dashboard?from=&to=):
//   - totalRevenue     : sum of SUCCESS payments in range
//   - bookingsByStatus : booking counts grouped by status
//   - newUsers         : users created in range
//   - topModels        : top 5 vehicle models by booking count
//   - revenueByDay     : daily SUCCESS-payment series (gap-filled)
//   - cancelRate       : cancelled / total bookings in range
//   - Redis cache 5-min, keyed by querystring (asserted via X-Cache header)
//
// Strategy mirrors bookings.test.js: mint JWTs directly, talk to real MySQL.
// We seed a private brand/model/vehicle + bookings + payments inside a known
// date window and assert the KPIs reflect exactly what we inserted.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// A fixed, in-the-past window so our seeded rows are the only ones in range.
// Using 2025-03 avoids collisions with other tests that seed "now"-ish data.
const FROM = '2025-03-01';
const TO = '2025-03-31';
const inRange = (day) => new Date(`2025-03-${String(day).padStart(2, '0')}T10:00:00.000Z`);
const OUT_OF_RANGE = new Date('2025-01-15T10:00:00.000Z');

let adminRole;
let customerRole;
let admin;
let adminToken;
let customer;
let customerToken;
let brand;
let modelA;
let modelB;
let vehicleA;
let vehicleB;
const bookingIds = [];
const paymentIds = [];
const seededUserIds = [];

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị viên', description: 'Admin' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Dashboard Admin',
      phone: `091${stamp}`,
      email: `dashadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
      createdAt: OUT_OF_RANGE, // admin itself must NOT count as a new user in range
    },
  });
  adminToken = signToken(admin.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Dashboard Customer',
      phone: `092${stamp}`,
      email: `dashcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
      createdAt: OUT_OF_RANGE,
    },
  });
  customerToken = signToken(customer.id);

  // Two "new users" created inside the window (in addition to the two above,
  // which are out of range). We assert newUsers >= 2 rather than == 2 because
  // other suites may also seed users in this month; the fixed 2025-03 window
  // keeps that noise low but we stay tolerant.
  for (let i = 0; i < 2; i += 1) {
    const u = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: `New User ${i}`,
        phone: `03${stamp}${i}`,
        email: `dashnew_${i}_${stamp}@example.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
        createdAt: inRange(5 + i),
      },
    });
    seededUserIds.push(u.id);
  }

  brand = await prisma.brand.upsert({
    where: { slug: `dash-brand-${stamp}` },
    update: {},
    create: { name: `DashBrand${stamp}`, slug: `dash-brand-${stamp}` },
  });

  modelA = await prisma.vehicleModel.create({
    data: { brandId: brand.id, name: `DashModelA${stamp}`, slug: `dash-model-a-${stamp}` },
  });
  modelB = await prisma.vehicleModel.create({
    data: { brandId: brand.id, name: `DashModelB${stamp}`, slug: `dash-model-b-${stamp}` },
  });

  vehicleA = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      modelId: modelA.id,
      name: 'Dash Car A',
      slug: `dash-car-a-${stamp}`,
      modelYear: 2024,
      licensePlate: `51A-${stamp}`,
      pricePerDay: 1_000_000,
      status: 'AVAILABLE',
    },
  });
  vehicleB = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      modelId: modelB.id,
      name: 'Dash Car B',
      slug: `dash-car-b-${stamp}`,
      modelYear: 2024,
      licensePlate: `51B-${stamp}`,
      pricePerDay: 800_000,
      status: 'AVAILABLE',
    },
  });

  // Bookings in range:
  //   modelA (vehicleA): 3 bookings  → 2 COMPLETED, 1 CANCELLED
  //   modelB (vehicleB): 1 booking   → CONFIRMED
  // → total 4, cancelled 1 → cancelRate 0.25; topModels[0] = modelA (3).
  const bookingPlan = [
    { vehicleId: vehicleA.id, status: 'COMPLETED', day: 3 },
    { vehicleId: vehicleA.id, status: 'COMPLETED', day: 4 },
    { vehicleId: vehicleA.id, status: 'CANCELLED', day: 5 },
    { vehicleId: vehicleB.id, status: 'CONFIRMED', day: 6 },
  ];

  for (let i = 0; i < bookingPlan.length; i += 1) {
    const p = bookingPlan[i];
    const b = await prisma.booking.create({
      data: {
        bookingCode: `DASH-${stamp}-${i}`,
        userId: customer.id,
        vehicleId: p.vehicleId,
        rentalType: 'SELF_DRIVE',
        pickupAt: inRange(p.day),
        returnAt: inRange(p.day + 2),
        totalDays: 2,
        pricePerDay: 1_000_000,
        subtotal: 2_000_000,
        totalAmount: 2_000_000,
        status: p.status,
        createdAt: inRange(p.day),
      },
    });
    bookingIds.push(b.id);
  }

  // Payments in range: two SUCCESS on different days, one FAILED (excluded),
  // plus one SUCCESS out of range (excluded).
  const paymentPlan = [
    { status: 'SUCCESS', amount: 2_000_000, paidAt: inRange(3) },
    { status: 'SUCCESS', amount: 2_000_000, paidAt: inRange(4) },
    { status: 'FAILED', amount: 999_000, paidAt: inRange(4) },
    { status: 'SUCCESS', amount: 5_000_000, paidAt: OUT_OF_RANGE },
  ];
  for (let i = 0; i < paymentPlan.length; i += 1) {
    const p = paymentPlan[i];
    const pay = await prisma.payment.create({
      data: {
        bookingId: bookingIds[0],
        userId: customer.id,
        type: 'BOOKING',
        method: 'VNPAY',
        amount: p.amount,
        status: p.status,
        txnRef: `dash-txn-${stamp}-${i}`,
        paidAt: p.paidAt,
      },
    });
    paymentIds.push(pay.id);
  }
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
  await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleA.id, vehicleB.id] } } }).catch(() => {});
  await prisma.vehicleModel.deleteMany({ where: { id: { in: [modelA.id, modelB.id] } } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [admin.id, customer.id, ...seededUserIds] } } })
    .catch(() => {});
  await prisma.$disconnect();
});

describe('GET /admin/dashboard — RBAC (UC-52)', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/dashboard`);
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/dashboard`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/dashboard — KPIs (UC-52)', () => {
  it('422 when to < from', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/dashboard?from=2025-03-31&to=2025-03-01`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('returns the six KPIs computed over the seeded window', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/dashboard?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;

    // Total revenue = the two in-range SUCCESS payments only.
    expect(d.totalRevenue).toBe(4_000_000);

    // Bookings by status (our four seeded bookings).
    expect(d.bookingsByStatus.COMPLETED).toBe(2);
    expect(d.bookingsByStatus.CANCELLED).toBe(1);
    expect(d.bookingsByStatus.CONFIRMED).toBe(1);
    expect(d.totalBookings).toBe(4);

    // New users created in range — at least the two we seeded.
    expect(d.newUsers).toBeGreaterThanOrEqual(2);

    // Cancel rate = 1/4 = 0.25.
    expect(d.cancelRate).toBeCloseTo(0.25, 4);

    // Top models — modelA (3 bookings) ranks above modelB (1).
    const a = d.topModels.find((m) => m.modelId === modelA.id);
    const b = d.topModels.find((m) => m.modelId === modelB.id);
    expect(a).toBeDefined();
    expect(a.bookings).toBe(3);
    expect(b.bookings).toBe(1);
    const idxA = d.topModels.findIndex((m) => m.modelId === modelA.id);
    const idxB = d.topModels.findIndex((m) => m.modelId === modelB.id);
    expect(idxA).toBeLessThan(idxB);

    // Revenue-by-day: gap-filled to one point per day across the 31-day window,
    // with the two paid days carrying 2,000,000 each.
    expect(Array.isArray(d.revenueByDay)).toBe(true);
    expect(d.revenueByDay).toHaveLength(31);
    const day3 = d.revenueByDay.find((p) => p.date === '2025-03-03');
    const day4 = d.revenueByDay.find((p) => p.date === '2025-03-04');
    expect(day3.revenue).toBe(2_000_000);
    expect(day4.revenue).toBe(2_000_000);
    const seriesTotal = d.revenueByDay.reduce((s, p) => s + p.revenue, 0);
    expect(seriesTotal).toBe(4_000_000);
  });

  it('serves the second identical request from cache (X-Cache: HIT)', async () => {
    const url = `${BASE}/admin/dashboard?from=${FROM}&to=${TO}`;
    const first = await request(app).get(url).set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app).get(url).set('Authorization', `Bearer ${adminToken}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The in-memory ioredis mock persists across requests in a test run, so the
    // second hit for the same querystring must be served from cache.
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.data.totalRevenue).toBe(first.body.data.totalRevenue);
  });
});
