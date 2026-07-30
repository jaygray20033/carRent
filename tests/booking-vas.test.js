// tests/booking-vas.test.js — ENT-Day 2 integration + IDOR
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);
const sign = (id) => jwt.sign({ userId: id }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let otorentAdmin;
let otorentAdminToken;
let companyA;
let companyB;
let employeeA1;
let employeeA1Token;
let empA1Mem;
let corpAdminBToken;
let interpreter;
let security;
let inactiveVas;
let pendingBooking;
let approvedBooking;
let inProgressBooking;
let confirmedBooking;
let vasLinePending;
let vasLineApproved;

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Admin', description: 'a' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Customer', description: 'c' },
  });

  otorentAdmin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'OT Admin VAS',
      phone: `060${stamp}`.slice(0, 10),
      email: `otvas_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `VASCoA ${stamp}`,
      taxCode: `51${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractEnd: new Date(Date.now() + 365 * 86400_000),
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `VASCoB ${stamp}`,
      taxCode: `52${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  const corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A VAS',
      phone: `061${stamp}`.slice(0, 10),
      email: `adavas_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: corpAdminA.id,
      isAdmin: true,
      isActive: true,
    },
  });

  employeeA1 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A1 VAS',
      phone: `062${stamp}`.slice(0, 10),
      email: `a1vas_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA1Token = sign(employeeA1.id);
  empA1Mem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA1.id,
      isAdmin: false,
      isActive: true,
    },
  });

  const corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B VAS',
      phone: `063${stamp}`.slice(0, 10),
      email: `adbvas_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminBToken = sign(corpAdminB.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyB.id,
      userId: corpAdminB.id,
      isAdmin: true,
      isActive: true,
    },
  });

  interpreter = await prisma.valueAddedService.create({
    data: {
      code: `INTERP_${stamp}`,
      name: 'Phiên dịch viên',
      unit: 'người/chuyến',
      basePrice: 500000,
      requiresHeadcount: true,
      isActive: true,
    },
  });
  security = await prisma.valueAddedService.create({
    data: {
      code: `SEC_${stamp}`,
      name: 'Bảo vệ',
      unit: 'người/chuyến',
      basePrice: 800000,
      requiresHeadcount: true,
      isActive: true,
    },
  });
  inactiveVas = await prisma.valueAddedService.create({
    data: {
      code: `OFF_${stamp}`,
      name: 'VAS Off',
      unit: 'buổi',
      basePrice: 100000,
      requiresHeadcount: false,
      isActive: false,
    },
  });

  // Negotiated interpreter price for company A
  await prisma.corporateVASPrice.create({
    data: {
      corporateId: companyA.id,
      vasId: interpreter.id,
      price: 450000,
    },
  });

  const mkBooking = (status, employeeId = empA1Mem.id) =>
    prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId,
        purpose: `vas ${status}`,
        pickupAt: new Date(Date.now() + 5 * 3600_000),
        returnAt: new Date(Date.now() + 12 * 3600_000),
        pickupAddress: 'Q1',
        dropoffAddress: 'Q3',
        basePrice: 1_300_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        status,
      },
    });

  pendingBooking = await mkBooking('PENDING');
  approvedBooking = await mkBooking('APPROVED');
  inProgressBooking = await mkBooking('IN_PROGRESS');
  confirmedBooking = await mkBooking('CONFIRMED');
});

afterAll(async () => {
  // Cleanup via cascade
  if (companyA) await prisma.corporateClient.delete({ where: { id: companyA.id } }).catch(() => {});
  if (companyB) await prisma.corporateClient.delete({ where: { id: companyB.id } }).catch(() => {});
  for (const u of [otorentAdmin, employeeA1]) {
    if (u) await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  for (const v of [interpreter, security, inactiveVas]) {
    if (v) await prisma.valueAddedService.delete({ where: { id: v.id } }).catch(() => {});
  }
});

describe('ENT-Day 2 — public / admin VAS catalog', () => {
  test('GET /vas unauthenticated → 200 active catalog', async () => {
    const res = await request(app).get(`${BASE}/vas`);
    expect(res.status).toBe(200);
    const items = res.body.data?.items || res.body.items || [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((v) => v.code === interpreter.code)).toBe(true);
    expect(items.every((v) => v.isActive !== false)).toBe(true);
    expect(items.some((v) => v.code === inactiveVas.code)).toBe(false);
  });

  test('POST /admin/vas creates new VAS', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/vas`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        code: `NEW_${stamp}`,
        name: 'Hướng dẫn viên',
        unit: 'người/ngày',
        basePrice: 700000,
        requiresHeadcount: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.vas.code).toBe(`NEW_${stamp}`);
    await prisma.valueAddedService.delete({ where: { id: res.body.data.vas.id } }).catch(() => {});
  });

  test('PUT /admin/vas/:id updates base price + inactive', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/vas/${security.id}`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ basePrice: 850000, isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.data.vas.basePrice).toBe(850000);
  });

  test('PUT /admin/corporate-clients/:id/vas-pricing sets negotiated prices', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-clients/${companyA.id}/vas-pricing`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        prices: [{ vasId: security.id, price: 750000, note: 'HĐ AssetHub' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.prices[0].price).toBe(750000);
  });
});

describe('ENT-Day 2 — corporate VAS pricing + booking VAS', () => {
  test('GET /corporate/me/vas-pricing returns negotiated override', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/vas-pricing`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const interp = items.find((i) => i.vasId === interpreter.id);
    expect(interp).toBeTruthy();
    expect(interp.unitPrice).toBe(450000);
    expect(interp.isNegotiated).toBe(true);
    expect(interp.basePrice).toBe(500000);
  });

  test('unauthenticated GET /corporate/me/vas-pricing → 401', async () => {
    const res = await request(app).get(`${BASE}/corporate/me/vas-pricing`);
    expect(res.status).toBe(401);
  });

  test('POST /corporate/bookings/:id/vas happy path — snapshot negotiated price', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: interpreter.id, headcount: 2, note: 'EN-KR' });
    expect(res.status).toBe(201);
    const line = res.body.data.bookingVas;
    expect(line.unitPrice).toBe(450000);
    expect(line.headcount).toBe(2);
    expect(line.totalPrice).toBe(900000);
    expect(line.status).toBe('PENDING');
    vasLinePending = line;
  });

  test('add security VAS on APPROVED booking', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${approvedBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: security.id, headcount: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.bookingVas.unitPrice).toBe(750000); // negotiated
    expect(res.body.data.bookingVas.totalPrice).toBe(750000);
    vasLineApproved = res.body.data.bookingVas;
  });

  test('add VAS when IN_PROGRESS → 409 BOOKING_LOCKED_FOR_VAS', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${inProgressBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: interpreter.id, headcount: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toMatch(/BOOKING_LOCKED_FOR_VAS/);
  });

  test('add VAS when CONFIRMED → 409 BOOKING_LOCKED_FOR_VAS', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${confirmedBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: interpreter.id, headcount: 1 });
    expect(res.status).toBe(409);
  });

  test('add non-existent VAS → 404', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: 99999999, headcount: 1 });
    expect(res.status).toBe(404);
  });

  test('add inactive VAS → 404', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: inactiveVas.id, headcount: 1 });
    expect(res.status).toBe(404);
  });

  test('headcount = 0 → 422', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: interpreter.id, headcount: 0 });
    expect(res.status).toBe(422);
  });

  test('DELETE VAS when PENDING → ok', async () => {
    // add a disposable line then delete
    const add = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: security.id, headcount: 1 });
    expect(add.status).toBe(201);
    const id = add.body.data.bookingVas.id;
    const res = await request(app)
      .delete(`${BASE}/corporate/bookings/${pendingBooking.id}/vas/${id}`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  test('DELETE VAS when APPROVED → 409', async () => {
    const res = await request(app)
      .delete(`${BASE}/corporate/bookings/${approvedBooking.id}/vas/${vasLineApproved.id}`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(409);
  });

  test('cost-summary includes VAS + expenses + VAT', async () => {
    // pendingBooking has interpreter x2 @ 450k = 900k, base 1.3M
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${pendingBooking.id}/cost-summary`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.basePrice).toBe(1_300_000);
    expect(s.vasTotal).toBe(900_000);
    expect(s.subtotal).toBe(2_200_000);
    expect(s.vat10).toBe(220_000);
    expect(s.total).toBe(2_420_000);
    expect(s.vas.some((v) => v.name === 'Phiên dịch viên')).toBe(true);
  });

  test('admin assign VAS provider → CONFIRMED + notify employee', async () => {
    const res = await request(app)
      .put(
        `${BASE}/admin/corporate-bookings/${pendingBooking.id}/vas/${vasLinePending.id}/assign`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ providerId: 42 });
    expect(res.status).toBe(200);
    expect(res.body.data.bookingVas.status).toBe('CONFIRMED');
    expect(res.body.data.bookingVas.providerId).toBe(42);
    expect(res.body.data.bookingVas.confirmedAt).toBeTruthy();

    const notif = await prisma.notification.findFirst({
      where: {
        userId: employeeA1.id,
        type: 'CORPORATE_BOOKING_VAS_CONFIRMED',
      },
      orderBy: { id: 'desc' },
    });
    expect(notif).toBeTruthy();
  });
});

describe('ENT-Day 2 — IDOR', () => {
  test('corpAdminB cannot add VAS to company A booking → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBooking.id}/vas`)
      .set('Authorization', `Bearer ${corpAdminBToken}`)
      .send({ vasId: interpreter.id, headcount: 1 });
    expect(res.status).toBe(403);
  });

  test('employee cannot assign VAS provider (admin only) → 403', async () => {
    const res = await request(app)
      .put(
        `${BASE}/admin/corporate-bookings/${pendingBooking.id}/vas/${vasLinePending.id}/assign`
      )
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ providerId: 1 });
    expect(res.status).toBe(403);
  });
});
