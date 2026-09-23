// tests/adminCoupons.test.js — Admin coupon CRUD (UC-57)
//
// Real routes (src/api/v1/admin/coupons/*, mounted at /admin/coupons):
//   guard: authenticate + requireRole(['ADMIN','OPERATOR'])
//   GET    /admin/coupons        → paginated { data:[...], meta }
//   GET    /admin/coupons/:id    → { coupon } (incl. usageCount)
//   POST   /admin/coupons        → 201 { coupon }
//   PATCH  /admin/coupons/:id    → { coupon }
//   DELETE /admin/coupons/:id    → { id }  (409 COUPON_IN_USE when already redeemed)
//
// Validation (adminCoupon.validator.js):
//   endAt <= startAt  → 422 VALIDATION
//   type=PERCENT & value>100 → 422 VALIDATION
//   duplicate code    → 409 DUPLICATE
//   valid types: FIXED | PERCENT | FREE_DRIVER  (NOTE: not "PERCENTAGE")
//
// Strategy mirrors adminDashboard.test.js: mint JWTs directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let admin;
let adminToken;
let customer;
let customerToken;
const createdCouponIds = [];
let usedCoupon; // seeded directly with a CouponUsage row

// A valid future window.
const START = new Date('2026-08-01T00:00:00.000Z');
const END = new Date('2026-12-31T00:00:00.000Z');

const codeFor = (suffix) => `TEST${stamp}${suffix}`.toUpperCase();

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
      fullName: 'Coupon Admin',
      phone: `090${stamp}`.slice(0, 11),
      email: `couponadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Coupon Customer',
      phone: `091${stamp}`.slice(0, 11),
      email: `couponcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customerToken = signToken(customer.id);

  // A coupon that already has a usage row → delete must be blocked.
  usedCoupon = await prisma.coupon.create({
    data: {
      code: codeFor('USED'),
      type: 'FIXED',
      value: 50000,
      startAt: START,
      endAt: END,
    },
  });
  createdCouponIds.push(usedCoupon.id);
  await prisma.couponUsage.create({
    data: { couponId: usedCoupon.id, userId: customer.id, bookingId: 1, discount: 50000 },
  });
});

afterAll(async () => {
  await prisma.couponUsage
    .deleteMany({ where: { couponId: { in: createdCouponIds } } })
    .catch(() => {});
  await prisma.coupon.deleteMany({ where: { id: { in: createdCouponIds } } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin?.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: customer?.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('admin/coupons — RBAC + auth guard', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/coupons`);
    expect(res.status).toBe(401);
  });

  it('403 for a normal CUSTOMER user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe('admin/coupons — create validation', () => {
  it('POST valid FIXED coupon → 201, code uppercased', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: codeFor('fix').toLowerCase(), // lower-case in, upper-case out
        type: 'FIXED',
        value: 30000,
        startAt: START.toISOString(),
        endAt: END.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.coupon.code).toBe(codeFor('FIX'));
    expect(res.body.data.coupon.type).toBe('FIXED');
    createdCouponIds.push(res.body.data.coupon.id);

    const inDb = await prisma.coupon.findUnique({
      where: { id: res.body.data.coupon.id },
    });
    expect(inDb.code).toBe(codeFor('FIX'));
  });

  it('POST endAt <= startAt → 422 VALIDATION', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: codeFor('bad'),
        type: 'FIXED',
        value: 10000,
        startAt: END.toISOString(),
        endAt: START.toISOString(), // before start → invalid
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('POST PERCENT value > 100 → 422 VALIDATION', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: codeFor('pct'),
        type: 'PERCENT',
        value: 150, // > 100 → invalid
        startAt: START.toISOString(),
        endAt: END.toISOString(),
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('POST duplicate code → 409 DUPLICATE', async () => {
    const dupCode = codeFor('dup');
    const first = await request(app)
      .post(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: dupCode,
        type: 'PERCENT',
        value: 10,
        startAt: START.toISOString(),
        endAt: END.toISOString(),
      });
    expect(first.status).toBe(201);
    createdCouponIds.push(first.body.data.coupon.id);

    const second = await request(app)
      .post(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: dupCode.toLowerCase(), // same code, different case
        type: 'FIXED',
        value: 5000,
        startAt: START.toISOString(),
        endAt: END.toISOString(),
      });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE');
  });
});

describe('admin/coupons — read / update / delete', () => {
  it('GET list → paginated shape with meta', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/coupons`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  it('GET list?q= → filters by code substring', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/coupons`)
      .query({ q: codeFor('FIX') })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((c) => c.code.includes(codeFor('FIX')))).toBe(true);
  });

  it('GET :id → coupon detail with usageCount', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/coupons/${usedCoupon.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.coupon.id).toBe(usedCoupon.id);
    expect(res.body.data.coupon.usageCount).toBe(1);
  });

  it('GET :id non-existent → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/coupons/99999999`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('PATCH :id → updates value + isActive', async () => {
    const target = createdCouponIds.find((id) => id !== usedCoupon.id);
    const res = await request(app)
      .patch(`${BASE}/admin/coupons/${target}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 99000, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.coupon.value).toBe(99000);
    expect(res.body.data.coupon.isActive).toBe(false);

    const inDb = await prisma.coupon.findUnique({ where: { id: target } });
    expect(inDb.value).toBe(99000);
    expect(inDb.isActive).toBe(false);
  });

  it('DELETE an unused coupon → 200, row gone', async () => {
    // Create a throwaway unused coupon just to delete it.
    const made = await prisma.coupon.create({
      data: {
        code: codeFor('del'),
        type: 'FIXED',
        value: 12000,
        startAt: START,
        endAt: END,
      },
    });

    const res = await request(app)
      .delete(`${BASE}/admin/coupons/${made.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(made.id);

    const gone = await prisma.coupon.findUnique({ where: { id: made.id } });
    expect(gone).toBeNull();
  });

  it('DELETE a used coupon → 409 COUPON_IN_USE (kept for audit)', async () => {
    const res = await request(app)
      .delete(`${BASE}/admin/coupons/${usedCoupon.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COUPON_IN_USE');

    // Still present in the DB.
    const still = await prisma.coupon.findUnique({ where: { id: usedCoupon.id } });
    expect(still).not.toBeNull();
  });
});
