// tests/c2c-dispatch.test.js — C2C dispatch features (admin notify + assign + upcoming-pickups)
//
// Covers the three C2C improvements:
//   1. Admins (ADMIN/OPERATOR) get a BOOKING_NEW notification when a booking confirms
//      (exercised here via POST /admin/bookings/:id/confirm-payment, which fans out).
//   2. POST /admin/bookings/:id/assign-staff — assigns an ADMIN/OPERATOR/AGENT handover
//      agent, notifies them (BOOKING_ASSIGNED), and rejects wrong role / inactive / bad status.
//   3. GET /admin/bookings/upcoming-pickups — CONFIRMED pickups in the window, with
//      unassigned / assignedStaffId filters.
//
// Mirrors adminBookings.test.js: mint JWTs directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { BOOKING_STATUS } = await import('../src/config/constants.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const HOUR = 3600_000;

let adminRole;
let operatorRole;
let agentRole;
let customerRole;

let admin;
let adminToken;
let operator;
let agent;
let customer;

let brand;
let vehicle;
const bookingIds = [];
const userIds = [];

// Bookings for the various assertions.
let bkPending; // PENDING_PAYMENT — confirm-payment fan-out
let bkAssign; // CONFIRMED — assign-staff happy path
let bkBadStatus; // COMPLETED — assign-staff 409
let bkSoon; // CONFIRMED, pickup in +6h — upcoming, unassigned
let bkSoonAssigned; // CONFIRMED, pickup in +8h — upcoming, assigned to agent
let bkFar; // CONFIRMED, pickup in +72h — outside default 24h window

const makeBooking = (status, over = {}) =>
  prisma.booking.create({
    data: {
      bookingCode: `C2C-${stamp}-${over.suffix ?? status.slice(0, 3)}`,
      userId: customer.id,
      vehicleId: vehicle.id,
      pickupAt: over.pickupAt ?? new Date(Date.now() + 6 * HOUR),
      returnAt: over.returnAt ?? new Date(Date.now() + 30 * HOUR),
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
  operatorRole = await prisma.role.upsert({
    where: { code: 'OPERATOR' },
    update: {},
    create: { code: 'OPERATOR', name: 'Điều hành', description: 'Operator' },
  });
  agentRole = await prisma.role.upsert({
    where: { code: 'AGENT' },
    update: {},
    create: { code: 'AGENT', name: 'Nhân viên giao xe', description: 'Agent' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Dispatch Admin',
      phone: `090${stamp}`.slice(0, 11),
      email: `dispadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);

  operator = await prisma.user.create({
    data: {
      roleId: operatorRole.id,
      fullName: 'Dispatch Operator',
      phone: `092${stamp}`.slice(0, 11),
      email: `dispop_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  agent = await prisma.user.create({
    data: {
      roleId: agentRole.id,
      fullName: 'Dispatch Agent',
      phone: `093${stamp}`.slice(0, 11),
      email: `dispagent_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Dispatch Customer',
      phone: `091${stamp}`.slice(0, 11),
      email: `dispcust_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  userIds.push(admin.id, operator.id, agent.id, customer.id);

  brand = await prisma.brand.upsert({
    where: { slug: `disp-brand-${stamp}` },
    update: {},
    create: { name: `DispBrand${stamp}`, slug: `disp-brand-${stamp}` },
  });

  vehicle = await prisma.vehicle.create({
    data: {
      brandId: brand.id,
      name: 'Dispatch Test Car',
      slug: `disp-car-${stamp}`,
      modelYear: 2024,
      licensePlate: `77T-${stamp}`.slice(0, 15),
      pricePerDay: 500000,
      status: 'AVAILABLE',
    },
  });

  bkPending = await makeBooking(BOOKING_STATUS.PENDING_PAYMENT, { suffix: 'PEN' });
  bkAssign = await makeBooking(BOOKING_STATUS.CONFIRMED, { suffix: 'ASG' });
  bkBadStatus = await makeBooking(BOOKING_STATUS.COMPLETED, { suffix: 'CMP' });
  bkSoon = await makeBooking(BOOKING_STATUS.CONFIRMED, {
    suffix: 'SOON',
    pickupAt: new Date(Date.now() + 6 * HOUR),
  });
  bkSoonAssigned = await makeBooking(BOOKING_STATUS.CONFIRMED, {
    suffix: 'SASG',
    pickupAt: new Date(Date.now() + 8 * HOUR),
    data: { assignedStaffId: agent.id, assignedAt: new Date() },
  });
  bkFar = await makeBooking(BOOKING_STATUS.CONFIRMED, {
    suffix: 'FAR',
    pickupAt: new Date(Date.now() + 72 * HOUR),
  });

  bookingIds.push(
    bkPending.id,
    bkAssign.id,
    bkBadStatus.id,
    bkSoon.id,
    bkSoonAssigned.id,
    bkFar.id
  );

  await prisma.payment.create({
    data: {
      bookingId: bkPending.id,
      userId: customer.id,
      type: 'BOOKING',
      method: 'BANK_TRANSFER',
      amount: 1000000,
      status: 'PENDING',
      txnRef: `disp-pending-${stamp}`,
    },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
  await prisma.bookingHistory
    .deleteMany({ where: { bookingId: { in: bookingIds } } })
    .catch(() => {});
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
  await prisma.vehicle.delete({ where: { id: vehicle?.id } }).catch(() => {});
  await prisma.brand.delete({ where: { id: brand?.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('C2C dispatch — admin notification on booking confirm', () => {
  it('confirm-payment fans out a BOOKING_NEW notification to ADMIN + OPERATOR', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkPending.id}/confirm-payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ method: 'BANK_TRANSFER', note: 'offline settled' });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CONFIRMED');

    const adminNotif = await prisma.notification.findFirst({
      where: { userId: admin.id, type: 'BOOKING_NEW' },
      orderBy: { createdAt: 'desc' },
    });
    expect(adminNotif).not.toBeNull();
    expect(adminNotif.title).toContain(bkPending.bookingCode);

    const opNotif = await prisma.notification.findFirst({
      where: { userId: operator.id, type: 'BOOKING_NEW' },
    });
    expect(opNotif).not.toBeNull();

    // The AGENT is not in the fan-out roles — should get nothing.
    const agentNotif = await prisma.notification.findFirst({
      where: { userId: agent.id, type: 'BOOKING_NEW' },
    });
    expect(agentNotif).toBeNull();
  });
});

describe('C2C dispatch — assign-staff', () => {
  it('assigns an AGENT to a CONFIRMED booking and notifies them', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkAssign.id}/assign-staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ staffId: agent.id });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.assignedStaffId).toBe(agent.id);
    expect(res.body.data.booking.assignedStaff.id).toBe(agent.id);
    expect(res.body.data.booking.assignedAt).not.toBeNull();

    const inDb = await prisma.booking.findUnique({ where: { id: bkAssign.id } });
    expect(inDb.assignedStaffId).toBe(agent.id);

    const notif = await prisma.notification.findFirst({
      where: { userId: agent.id, type: 'BOOKING_ASSIGNED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).not.toBeNull();
    expect(notif.title).toContain(bkAssign.bookingCode);

    // History row records the assignment.
    const hist = await prisma.bookingHistory.findFirst({
      where: { bookingId: bkAssign.id, note: { contains: 'Gán nhân viên' } },
    });
    expect(hist).not.toBeNull();
  });

  it('rejects assigning a CUSTOMER (wrong role) → 422 STAFF_ROLE_INVALID', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkAssign.id}/assign-staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ staffId: customer.id });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('STAFF_ROLE_INVALID');
  });

  it('rejects assignment on a COMPLETED booking → 409 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkBadStatus.id}/assign-staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ staffId: agent.id });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects a non-existent staff → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkAssign.id}/assign-staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ staffId: 99999999 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('422 VALIDATION when staffId is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/bookings/${bkAssign.id}/assign-staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('C2C dispatch — upcoming-pickups', () => {
  it('returns CONFIRMED pickups within the default 24h window, soonest-first', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(24);
    const ids = res.body.data.items.map((b) => b.id);

    // Soon (+6h) and soon-assigned (+8h) are inside 24h; far (+72h) is not.
    expect(ids).toContain(bkSoon.id);
    expect(ids).toContain(bkSoonAssigned.id);
    expect(ids).not.toContain(bkFar.id);

    // Every returned booking must be CONFIRMED.
    expect(res.body.data.items.every((b) => b.status === 'CONFIRMED')).toBe(true);

    // Sorted ascending by pickupAt.
    const times = res.body.data.items.map((b) => new Date(b.pickupAt).getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('unassigned=true returns only bookings without a handover agent', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .query({ unassigned: 'true' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((b) => b.id);
    expect(ids).toContain(bkSoon.id); // unassigned
    expect(ids).not.toContain(bkSoonAssigned.id); // assigned to agent
    expect(res.body.data.items.every((b) => b.assignedStaffId == null)).toBe(true);
  });

  it('assignedStaffId filter returns only that staff\'s pickups', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .query({ assignedStaffId: agent.id })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((b) => b.id);
    expect(ids).toContain(bkSoonAssigned.id);
    expect(ids).not.toContain(bkSoon.id);
    expect(res.body.data.items.every((b) => b.assignedStaffId === agent.id)).toBe(true);
  });

  it('a wider window (hours=96) pulls in the far pickup', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .query({ hours: 96 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.windowHours).toBe(96);
    const ids = res.body.data.items.map((b) => b.id);
    expect(ids).toContain(bkFar.id);
  });

  it('422 VALIDATION for hours out of range (>168)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .query({ hours: 999 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('403 for a non-staff CUSTOMER', async () => {
    const customerToken = signToken(customer.id);
    const res = await request(app)
      .get(`${BASE}/admin/bookings/upcoming-pickups`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});
