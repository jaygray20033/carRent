// tests/adminReportsSettings.test.js — Day 35 admin reports (UC-59) + settings (UC-60)
//
// Reports (ADMIN/OPERATOR):
//   GET /admin/reports/revenue?from=&to=&group=day|month  (+ ?format=csv|excel|pdf)
//   GET /admin/reports/booking?from=&to=
//   GET /admin/reports/top-vehicles?from=&to=&limit=
// Settings (ADMIN only):
//   GET /admin/settings, PUT /admin/settings — key/value + Redis cache invalidate
//   pricingService.getPricingConfig() reads the pricing group from here.
//
// Strategy mirrors adminDashboard.test.js: mint JWTs directly, talk to real
// MySQL, seed a private window and assert reports reflect exactly what we insert.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { settingsService } = await import('../src/services/settingsService.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Fixed past window so our seeded rows are the only payments/bookings in range.
// 2025-04 avoids collision with adminDashboard.test.js (which uses 2025-03).
const FROM = '2025-04-01';
const TO = '2025-04-30';
const inRange = (day) => new Date(`2025-04-${String(day).padStart(2, '0')}T10:00:00.000Z`);
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
const touchedSettingKeys = [];

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
      fullName: 'Reports Admin',
      phone: `094${stamp}`,
      email: `rptadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
      createdAt: OUT_OF_RANGE,
    },
  });
  adminToken = signToken(admin.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Reports Customer',
      phone: `095${stamp}`,
      email: `rptcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
      createdAt: OUT_OF_RANGE,
    },
  });
  customerToken = signToken(customer.id);

  brand = await prisma.brand.upsert({
    where: { slug: `rpt-brand-${stamp}` },
    update: {},
    create: { name: `RptBrand${stamp}`, slug: `rpt-brand-${stamp}` },
  });

  modelA = await prisma.vehicleModel.create({
    data: { brandId: brand.id, name: `RptModelA${stamp}`, slug: `rpt-model-a-${stamp}` },
  });
  modelB = await prisma.vehicleModel.create({
    data: { brandId: brand.id, name: `RptModelB${stamp}`, slug: `rpt-model-b-${stamp}` },
  });

  vehicleA = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      modelId: modelA.id,
      name: 'Rpt Car A',
      slug: `rpt-car-a-${stamp}`,
      modelYear: 2024,
      licensePlate: `52A-${stamp}`,
      pricePerDay: 1_000_000,
      status: 'AVAILABLE',
    },
  });
  vehicleB = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      modelId: modelB.id,
      name: 'Rpt Car B',
      slug: `rpt-car-b-${stamp}`,
      modelYear: 2024,
      licensePlate: `52B-${stamp}`,
      pricePerDay: 800_000,
      status: 'AVAILABLE',
    },
  });

  // Bookings in range:
  //   vehicleA: 3 (2 COMPLETED, 1 CANCELLED)
  //   vehicleB: 1 (CONFIRMED)
  // → total 4, byStatus COMPLETED=2/CANCELLED=1/CONFIRMED=1; topVehicles[0]=vehicleA.
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
        bookingCode: `RPT-${stamp}-${i}`,
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

  // Payments in range: two SUCCESS VNPAY (day 3, 4) + one SUCCESS CASH (day 4),
  // one FAILED (excluded), one SUCCESS out of range (excluded).
  //   → total in range = 2,000,000*2 + 1,000,000 = 5,000,000; count 3.
  //   → byMethod: VNPAY 4,000,000 (2), CASH 1,000,000 (1).
  const paymentPlan = [
    { status: 'SUCCESS', method: 'VNPAY', amount: 2_000_000, paidAt: inRange(3) },
    { status: 'SUCCESS', method: 'VNPAY', amount: 2_000_000, paidAt: inRange(4) },
    { status: 'SUCCESS', method: 'CASH', amount: 1_000_000, paidAt: inRange(4) },
    { status: 'FAILED', method: 'VNPAY', amount: 999_000, paidAt: inRange(4) },
    { status: 'SUCCESS', method: 'VNPAY', amount: 7_000_000, paidAt: OUT_OF_RANGE },
  ];
  for (let i = 0; i < paymentPlan.length; i += 1) {
    const p = paymentPlan[i];
    const pay = await prisma.payment.create({
      data: {
        bookingId: bookingIds[0],
        userId: customer.id,
        type: 'BOOKING',
        method: p.method,
        amount: p.amount,
        status: p.status,
        txnRef: `rpt-txn-${stamp}-${i}`,
        paidAt: p.paidAt,
      },
    });
    paymentIds.push(pay.id);
  }
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
  await prisma.vehicle
    .deleteMany({ where: { id: { in: [vehicleA.id, vehicleB.id] } } })
    .catch(() => {});
  await prisma.vehicleModel
    .deleteMany({ where: { id: { in: [modelA.id, modelB.id] } } })
    .catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, customer.id] } } }).catch(() => {});
  await prisma.$disconnect();
});

// ─── Reports RBAC (UC-59) ──────────────────────────────────────────────
describe('Admin reports — RBAC (UC-59)', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/reports/revenue`);
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Revenue report (UC-59) ────────────────────────────────────────────
describe('GET /admin/reports/revenue (UC-59)', () => {
  it('422 when to < from', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=2025-04-30&to=2025-04-01`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('aggregates SUCCESS payments by day with method breakdown', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&group=day`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;

    expect(d.group).toBe('day');
    expect(d.total).toBe(5_000_000); // 2M + 2M + 1M in range; FAILED + out-of-range excluded
    expect(d.count).toBe(3);

    // Method breakdown, sorted by revenue desc.
    const vnpay = d.byMethod.find((m) => m.method === 'VNPAY');
    const cash = d.byMethod.find((m) => m.method === 'CASH');
    expect(vnpay.revenue).toBe(4_000_000);
    expect(vnpay.count).toBe(2);
    expect(cash.revenue).toBe(1_000_000);
    expect(cash.count).toBe(1);
    expect(d.byMethod[0].method).toBe('VNPAY'); // higher revenue first

    // Gap-filled daily series across the 30-day window.
    expect(Array.isArray(d.series)).toBe(true);
    expect(d.series).toHaveLength(30);
    const day3 = d.series.find((p) => p.period === '2025-04-03');
    const day4 = d.series.find((p) => p.period === '2025-04-04');
    expect(day3.revenue).toBe(2_000_000);
    expect(day4.revenue).toBe(3_000_000); // 2M VNPAY + 1M CASH on the same day
    const seriesTotal = d.series.reduce((s, p) => s + p.revenue, 0);
    expect(seriesTotal).toBe(5_000_000);
  });

  it('groups by month when group=month', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&group=month`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.group).toBe('month');
    expect(d.series).toHaveLength(1);
    expect(d.series[0].period).toBe('2025-04');
    expect(d.series[0].revenue).toBe(5_000_000);
  });

  it('serves the second identical request from cache (X-Cache: HIT)', async () => {
    const url = `${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&group=day`;
    const first = await request(app).get(url).set('Authorization', `Bearer ${adminToken}`);
    const second = await request(app).get(url).set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
  });
});

// ─── Revenue export (UC-59) ────────────────────────────────────────────
describe('GET /admin/reports/revenue?format= (UC-59 export)', () => {
  it('exports CSV', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('exports Excel (xlsx)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&format=excel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheet|excel|octet-stream/);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('exports PDF', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/revenue?from=${FROM}&to=${TO}&format=pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.length).toBeGreaterThan(0);
    // PDF files start with the "%PDF" magic bytes.
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });
});

// ─── Booking report (UC-59) ────────────────────────────────────────────
describe('GET /admin/reports/booking (UC-59)', () => {
  it('counts bookings grouped by status', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/booking?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.total).toBe(4);
    const byStatus = Object.fromEntries(d.byStatus.map((s) => [s.status, s.count]));
    expect(byStatus.COMPLETED).toBe(2);
    expect(byStatus.CANCELLED).toBe(1);
    expect(byStatus.CONFIRMED).toBe(1);
  });
});

// ─── Top vehicles report (UC-59) ───────────────────────────────────────
describe('GET /admin/reports/top-vehicles (UC-59)', () => {
  it('ranks vehicles by booking count', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/top-vehicles?from=${FROM}&to=${TO}&limit=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const a = items.find((v) => v.vehicleId === vehicleA.id);
    const b = items.find((v) => v.vehicleId === vehicleB.id);
    expect(a).toBeDefined();
    expect(a.bookings).toBe(3);
    expect(b.bookings).toBe(1);
    const idxA = items.findIndex((v) => v.vehicleId === vehicleA.id);
    const idxB = items.findIndex((v) => v.vehicleId === vehicleB.id);
    expect(idxA).toBeLessThan(idxB); // vehicleA (3) ranks above vehicleB (1)
    expect(a.brandName).toContain('RptBrand');
    expect(a.licensePlate).toBe(`52A-${stamp}`);
  });

  it('422 when limit exceeds 50', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/reports/top-vehicles?limit=999`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });
});

// ─── Settings (UC-60) ──────────────────────────────────────────────────
describe('Admin settings (UC-60)', () => {
  it('403 for a non-admin (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/settings`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('GET returns the settings map keyed by key', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/settings`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data).toBe('object');
  });

  it('422 when settings body is empty', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: {} });
    expect(res.status).toBe(422);
  });

  it('PUT upserts values, invalidates cache, and pricingService reflects the change', async () => {
    const key = `test_tax_rate_${stamp}`;
    touchedSettingKeys.push(key, 'tax_rate');

    // Prime the cache so we can prove the write invalidates it.
    await settingsService.getAll();

    const res = await request(app)
      .put(`${BASE}/admin/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: { [key]: 'hello', tax_rate: 12 } });

    expect(res.status).toBe(200);
    expect(res.body.data[key].value).toBe('hello');
    expect(res.body.data.tax_rate.value).toBe('12');

    // getPricingConfig reads the pricing group from settings (not hardcoded).
    const pricing = await settingsService.getPricingConfig();
    expect(pricing.taxRate).toBe(12);
  });
});
