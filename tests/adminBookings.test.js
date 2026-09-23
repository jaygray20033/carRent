// tests/adminBookings.test.js — Admin booking management (UC-54 / Day 30)
//
// Real routes (src/api/v1/admin/bookings/*, mounted at /admin/bookings):
//   guard: authenticate + requireRole(['ADMIN','OPERATOR','AGENT'])
//     - list / detail / note / confirm-payment / refund : ADMIN|OPERATOR only (NO_AGENT)
//     - start / return : ADMIN|OPERATOR|AGENT (HANDOVER)
//   GET  /admin/bookings                 → paginated { data:[...], meta }; filters status/from/to/q
//   GET  /admin/bookings/:id             → { booking } (payments + history)
//   POST /admin/bookings/:id/confirm-payment → PENDING_PAYMENT → CONFIRMED (BANK_TRANSFER/CASH)
//   POST /admin/bookings/:id/start       → CONFIRMED → IN_USE
//   POST /admin/bookings/:id/return      → IN_USE → COMPLETED (+ extraFee)
//
// NOTE: The todo mentioned a "confirm (PENDING_PAYMENT→CONFIRMED)" and "complete
// (IN_USE→COMPLETED)"; the real endpoints are /confirm-payment and /return.
// NOTE: No CSV export route exists in the real code — that described case is
// NOT implemented, so it is skipped (no route to hit).
//
// Strategy mirrors adminDashboard.test.js: mint JWTs directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { BOOKING_STATUS } = await import('../src/config/constants.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let admin;
let adminToken;
let customer;
let customerToken;
let brand;
let vehicle;
const bookingIds = [];

let bkPending; // PENDING_PAYMENT — used by confirm-payment
let bkConfirmed; // CONFIRMED — used by start
let bkInUse; // IN_USE — used by return
let bkCompleted; // COMPLETED — used by list filter

// Pickup window used for from/to date-range filter assertions.
const PICKUP = new Date('2026-09-15T10:00:00.000Z');
const RETURN = new Date('2026-09-17T10:00:00.000Z');

const makeBooking = (status, over = {}) =>
  prisma.booking.create({
    data: {
      bookingCode: `ADM-${stamp}-${over.suffix ?? status.slice(0, 3)}`,
      userId: customer.id,
      vehicleId: vehicle.id,
      pickupAt: PICKUP,
      returnAt: RETURN,
      totalDays: 2,
      pricePerDay: 500000,
      subtotal: 1000000,
      totalAmount: 1000000,
      status,
      ...(over.data || {}),
    },
  });

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
      fullName: 'Booking Admin',
      phone: `090${stamp}`.slice(0, 11),
      email: `bkadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Booking Customer',
      phone: `091${stamp}`.slice(0, 11),
      email: `bkcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customerToken = signToken(customer.id);

  brand = await prisma.brand.upsert({
    where: { slug: `adm-brand-${stamp}` },
    update: {},
    create: { name: `AdmBrand${stamp}`, slug: `adm-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Admin Test Car',
      slug: `adm-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `88T-${stamp}`.slice(0, 15),
      pricePerDay: 500000,
      status: 'AVAILABLE',
    },
  });

  bkPending = await makeBooking(BOOKING_STATUS.PENDING_PAYMENT, { suffix: 'PEN' });
  bkConfirmed = await makeBooking(BOOKING_STATUS.CONFIRMED, { suffix: 'CON' });
  bkInUse = await makeBooking(BOOKING_STATUS.IN_USE, { suffix: 'USE' });
  bkCompleted = await makeBooking(BOOKING_STATUS.COMPLETED, { suffix: 'CMP' });
  bookingIds.push(bkPending.id, bkConfirmed.id, bkInUse.id, bkCompleted.id);

  // Pending booking gets a PENDING payment to exercise the "reuse" branch.
  await prisma.payment.create({
    data: {
      bookingId: bkPending.id,
      userId: customer.id,
      type: 'BOOKING',
      method: 'BANK_TRANSFER',
      amount: 1000000,
      status: 'PENDING',
      txnRef: `pending-${stamp}`,
    },
  });
});

afterAll(async () => {
  // FK-safe: children (payments, history) → bookings → vehicle → brand → users.
  await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
  await prisma.bookingHistory
    .deleteMany({ where: { bookingId: { in: bookingIds } } })
    .catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle?.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand?.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin?.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: customer?.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('admin/bookings — RBAC + auth guard', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/admin/bookings`);
    expect(res.status).toBe(401);
  });

  it('403 for a normal CUSTOMER user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe('admin/bookings — list + filters', () => {
  it('GET list → paginated shape with meta', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  it('GET list?status=COMPLETED → only COMPLETED rows', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings`)
      .query({ status: 'COMPLETED', from: '2026-09-01', to: '2026-09-30', limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((b) => b.status === 'COMPLETED')).toBe(true);
    // Our seeded COMPLETED booking must be present.
    expect(res.body.data.some((b) => b.id === bkCompleted.id)).toBe(true);
  });

  it('GET list?q=<bookingCode> → matches by booking code', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings`)
      .query({ q: bkPending.bookingCode })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bkPending.id)).toBe(true);
  });

  it('GET list?status=<invalid> → 422 VALIDATION', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings`)
      .query({ status: 'NOPE' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('admin/bookings — detail', () => {
  it('GET :id → booking with payments + history arrays', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/${bkPending.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.id).toBe(bkPending.id);
    expect(Array.isArray(res.body.data.booking.payments)).toBe(true);
    expect(Array.isArray(res.body.data.booking.history)).toBe(true);
  });

  it('GET :id non-existent → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/99999999`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('admin/bookings — confirm-payment (PENDING_PAYMENT → CONFIRMED)', () => {
  it('POST /confirm-payment → 200, status CONFIRMED, payment SUCCESS', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkPending.id}/confirm-payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ method: 'BANK_TRANSFER', note: 'wired ok' });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CONFIRMED');

    const inDb = await prisma.booking.findUnique({ where: { id: bkPending.id } });
    expect(inDb.status).toBe('CONFIRMED');

    const pay = await prisma.payment.findFirst({
      where: { bookingId: bkPending.id, type: 'BOOKING' },
    });
    expect(pay.status).toBe('SUCCESS');
    expect(pay.paidAt).not.toBeNull();
  });

  it('POST /confirm-payment on an already-confirmed booking → 400 BOOKING_NOT_PAYABLE', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkPending.id}/confirm-payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ method: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BOOKING_NOT_PAYABLE');
  });
});

describe('admin/bookings — start (CONFIRMED → IN_USE)', () => {
  it('POST /start → 200, status IN_USE, actualPickupAt stamped, vehicle RENTED', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkConfirmed.id}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_USE');

    const inDb = await prisma.booking.findUnique({ where: { id: bkConfirmed.id } });
    expect(inDb.status).toBe('IN_USE');
    expect(inDb.actualPickupAt).not.toBeNull();

    const veh = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(veh.status).toBe('RENTED');
  });

  it('POST /start on a non-CONFIRMED booking → 400 BOOKING_NOT_STARTABLE', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkCompleted.id}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BOOKING_NOT_STARTABLE');
  });
});

describe('admin/bookings — return (IN_USE → COMPLETED)', () => {
  it('POST /return → 200, status COMPLETED, extraFee applied, vehicle AVAILABLE', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkInUse.id}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ extraFee: 75000, note: 'returned clean' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');

    const inDb = await prisma.booking.findUnique({ where: { id: bkInUse.id } });
    expect(inDb.status).toBe('COMPLETED');
    expect(inDb.extraFee).toBe(75000);
    expect(inDb.actualReturnAt).not.toBeNull();

    const veh = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(veh.status).toBe('AVAILABLE');
  });

  it('POST /return on a non-IN_USE booking → 400 BOOKING_NOT_RETURNABLE', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkCompleted.id}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BOOKING_NOT_RETURNABLE');
  });
});

describe('admin/bookings — internal note (timeline)', () => {
  it('POST /note → 200, appends a history entry', async () => {
    const before = await prisma.bookingHistory.count({ where: { bookingId: bkCompleted.id } });

    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkCompleted.id}/note`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Customer called about invoice' });

    expect(res.status).toBe(200);

    const after = await prisma.bookingHistory.count({ where: { bookingId: bkCompleted.id } });
    expect(after).toBe(before + 1);
  });
});
