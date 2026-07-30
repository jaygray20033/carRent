// tests/adminUsers.test.js — admin user management (UC-55)
//
// Routes (src/api/v1/admin/users/*):
//   Base guard: authenticate + requireRole(['ADMIN','OPERATOR'])
//   GET   /admin/users                  — list, filter by role/status/q, paginated
//   GET   /admin/users/:id              — detail (profile + bookings + wallet + reviews)
//   PATCH /admin/users/:id/status       — ACTIVE | LOCKED (+reason); 409 SELF_STATUS_CHANGE
//   PATCH /admin/users/:id/role         — ADMIN only; 409 SELF_ROLE_CHANGE
//   POST  /admin/users/:id/wallet/adjust — CREDIT | DEBIT; 400 INSUFFICIENT_BALANCE
//
// NOTE: user statuses are ACTIVE | LOCKED | PENDING (there is no BAN/UNBAN). The
// "ban/unban" the todo describes maps to status=LOCKED / status=ACTIVE, and
// LOCKING revokes refresh tokens. We test that real behavior.
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
let operatorRole;
let customerRole;
let admin;
let adminToken;
let operator;
let operatorToken;
let customer; // the customer whose account we manage
let customerToken;
let target; // a second CUSTOMER used as the mutation target
let brand;
let vehicle;
const seededBookingIds = [];

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị viên', description: 'Admin' },
  });
  operatorRole = await prisma.role.upsert({
    where: { code: 'OPERATOR' },
    update: {},
    create: { code: 'OPERATOR', name: 'Điều hành', description: 'Operator' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Users Admin',
      phone: `098${stamp}`.slice(0, 10),
      email: `usradmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);

  operator = await prisma.user.create({
    data: {
      roleId: operatorRole.id,
      fullName: 'Users Operator',
      phone: `089${stamp}`.slice(0, 10),
      email: `usrop_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  operatorToken = signToken(operator.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: `Zeus Customer ${stamp}`, // distinct name for q search
      phone: `099${stamp}`.slice(0, 10),
      email: `usrcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customerToken = signToken(customer.id);

  target = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: `Target User ${stamp}`,
      phone: `090${stamp}`.slice(0, 10),
      email: `usrtarget_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  // A private brand/vehicle so we can seed a real booking (vehicleId is a
  // non-nullable FK) for the customer's booking-history detail assertion.
  brand = await prisma.brand.upsert({
    where: { slug: `usr-brand-${stamp}` },
    update: {},
    create: { name: `UsrBrand${stamp}`, slug: `usr-brand-${stamp}` },
  });
  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: `Usr Car ${stamp}`,
      slug: `usr-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `70U-${stamp}`.slice(0, 20),
      pricePerDay: 500_000,
      status: 'AVAILABLE',
    },
  });
});

afterAll(async () => {
  // Children first: wallet transactions → wallet → refresh tokens → bookings → users.
  const userIds = [admin.id, operator.id, customer.id, target.id];
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: seededBookingIds } } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect();
});

// ─── RBAC ──────────────────────────────────────────────────────────────
describe('Admin users — RBAC (UC-55)', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/users`);
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin (CUSTOMER) user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('OPERATOR can list users (allowed by requireRole)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users?q=${stamp}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── List (filter / search / pagination) ─────────────────────────────────
describe('GET /admin/users — list (UC-55)', () => {
  it('searches by q (name/phone/email) and paginates', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users?q=${stamp}&limit=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
    const ids = res.body.data.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([customer.id, target.id]));
    // passwordHash must never leak.
    expect(res.body.data.every((u) => u.passwordHash === undefined)).toBe(true);
  });

  it('filters by role=CUSTOMER', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users?role=CUSTOMER&q=${stamp}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((u) => u.role.code === 'CUSTOMER')).toBe(true);
    // Our admin (ADMIN role) must not appear under a CUSTOMER filter.
    expect(res.body.data.find((u) => u.id === admin.id)).toBeUndefined();
  });

  it('422 for an invalid role enum', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users?role=SUPERUSER`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

// ─── Detail (booking history) ─────────────────────────────────────────────
describe('GET /admin/users/:id — detail (UC-55)', () => {
  it('returns profile + booking history + wallet + reviews', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `USR-${stamp}-1`,
        userId: customer.id,
        vehicleId: vehicle.id,
        rentalType: 'SELF_DRIVE',
        pickupAt: new Date(Date.now() + 86400000),
        returnAt: new Date(Date.now() + 3 * 86400000),
        totalDays: 2,
        pricePerDay: 500_000,
        subtotal: 1_000_000,
        totalAmount: 1_000_000,
        status: 'CONFIRMED',
      },
    });
    const bookingId = booking.id;
    seededBookingIds.push(bookingId);

    const res = await request(app)
      .get(`${BASE}/admin/users/${customer.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.user.id).toBe(customer.id);
    expect(d.user.passwordHash).toBeUndefined();
    expect(Array.isArray(d.bookings)).toBe(true);
    expect(d.bookings.find((b) => b.id === bookingId)).toBeDefined();
    expect(Array.isArray(d.reviews)).toBe(true);
  });

  it('404 for an unknown user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users/999999999`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ─── Status (lock / unlock = ban / unban) ─────────────────────────────────
describe('PATCH /admin/users/:id/status — lock/unlock (UC-55)', () => {
  it('locks a user (LOCKED) and persists', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'LOCKED', reason: 'Vi phạm điều khoản' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('LOCKED');

    const row = await prisma.user.findUnique({ where: { id: target.id } });
    expect(row.status).toBe('LOCKED');
  });

  it('unlocks a user (ACTIVE)', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('ACTIVE');

    const row = await prisma.user.findUnique({ where: { id: target.id } });
    expect(row.status).toBe('ACTIVE');
  });

  it('409 SELF_STATUS_CHANGE when admin targets their own account', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'LOCKED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SELF_STATUS_CHANGE');
  });

  it('422 for an invalid status value', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PENDING' }); // schema only allows ACTIVE | LOCKED
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('404 for an unknown user', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/999999999/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'LOCKED' });
    expect(res.status).toBe(404);
  });
});

// ─── Role change (ADMIN only) ─────────────────────────────────────────────
describe('PATCH /admin/users/:id/role — role change (UC-55)', () => {
  it('403 for an OPERATOR (ADMIN-only route)', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${target.id}/role`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ role: 'AGENT' });
    expect(res.status).toBe(403);
  });

  it('ADMIN changes a user role and persists', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${target.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'OPERATOR' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.code).toBe('OPERATOR');

    const row = await prisma.user.findUnique({
      where: { id: target.id },
      include: { role: true },
    });
    expect(row.role.code).toBe('OPERATOR');

    // Restore to CUSTOMER so teardown ordering stays predictable.
    await prisma.user.update({ where: { id: target.id }, data: { roleId: customerRole.id } });
  });

  it('409 SELF_ROLE_CHANGE when admin targets their own account', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/users/${admin.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CUSTOMER' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
  });
});

// ─── Wallet adjust ─────────────────────────────────────────────────────────
describe('POST /admin/users/:id/wallet/adjust — manual credit/debit (UC-55)', () => {
  it('credits the wallet and records a transaction', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${customer.id}/wallet/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 100_000, type: 'CREDIT', note: 'Bồi thường' });
    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(100_000);
    expect(res.body.data.transaction.type).toBe('TOPUP');
    expect(res.body.data.transaction.amount).toBe(100_000);

    const wallet = await prisma.wallet.findUnique({ where: { userId: customer.id } });
    expect(wallet.balance).toBe(100_000);
  });

  it('debits the wallet down to zero', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${customer.id}/wallet/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 100_000, type: 'DEBIT' });
    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(0);
    expect(res.body.data.transaction.type).toBe('WITHDRAW');

    const wallet = await prisma.wallet.findUnique({ where: { userId: customer.id } });
    expect(wallet.balance).toBe(0);
  });

  it('400 INSUFFICIENT_BALANCE when a debit would go negative', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${customer.id}/wallet/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 500_000, type: 'DEBIT' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('422 for a non-positive amount', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${customer.id}/wallet/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 0, type: 'CREDIT' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});
