// tests/ent-day5-security.test.js — ENT-Day 5 remaining security + contract-window + email alert
import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

// Mock email BEFORE app import so sla.service binds the mock.
const sendEmailMock = jest.fn(async () => ({ sent: true, messageId: 'mock' }));
jest.unstable_mockModule('../src/integrations/email.js', () => ({
  sendEmail: sendEmailMock,
  default: { sendEmail: sendEmailMock },
}));

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
let employeeA2;
let employeeA2Token;
let empA1Mem;
let empA2Mem;
let corpAdminA;
let corpAdminAToken;
let corpAdminBToken;
let c2cUser;
let c2cToken;
let interpreter;
let pendingBookingA1;
let pendingBookingA2;
let inProgressBooking;
let slaA;
let companyExpired;
let expiredSla;
let expiredBooking;

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
      fullName: 'OT Admin D5',
      phone: `090${stamp}`.slice(0, 10),
      email: `otd5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `D5CoA ${stamp}`,
      taxCode: `81${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractStart: new Date(Date.now() - 60 * 86400_000),
      contractEnd: new Date(Date.now() + 300 * 86400_000),
      contactEmail: `contact_a_d5_${stamp}@ex.com`,
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `D5CoB ${stamp}`,
      taxCode: `82${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  // Expired-contract company (for window tests)
  companyExpired = await prisma.corporateClient.create({
    data: {
      name: `D5Exp ${stamp}`,
      taxCode: `83${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractStart: new Date(Date.now() - 400 * 86400_000),
      contractEnd: new Date(Date.now() - 30 * 86400_000),
      contactEmail: `exp_${stamp}@ex.com`,
    },
  });

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A D5',
      phone: `091${stamp}`.slice(0, 10),
      email: `ada_d5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminAToken = sign(corpAdminA.id);
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
      fullName: 'Emp A1 D5',
      phone: `092${stamp}`.slice(0, 10),
      email: `a1_d5_${stamp}@ex.com`,
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

  employeeA2 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A2 D5',
      phone: `093${stamp}`.slice(0, 10),
      email: `a2_d5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA2Token = sign(employeeA2.id);
  empA2Mem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA2.id,
      isAdmin: false,
      isActive: true,
    },
  });

  const corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B D5',
      phone: `094${stamp}`.slice(0, 10),
      email: `adb_d5_${stamp}@ex.com`,
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

  // C2C regular user (no corporate membership)
  c2cUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'C2C User D5',
      phone: `095${stamp}`.slice(0, 10),
      email: `c2c_d5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  c2cToken = sign(c2cUser.id);

  interpreter = await prisma.valueAddedService.create({
    data: {
      code: `D5I_${stamp}`,
      name: 'Phiên dịch D5',
      unit: 'người/chuyến',
      basePrice: 500000,
      requiresHeadcount: true,
      isActive: true,
    },
  });

  const mkBooking = (employeeId, status = 'PENDING') =>
    prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId,
        purpose: `d5 ${status}`,
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

  pendingBookingA1 = await mkBooking(empA1Mem.id, 'PENDING');
  pendingBookingA2 = await mkBooking(empA2Mem.id, 'PENDING');
  inProgressBooking = await mkBooking(empA1Mem.id, 'IN_PROGRESS');

  slaA = await prisma.contractSLA.create({
    data: {
      corporateId: companyA.id,
      code: `PUNCT_${stamp}`,
      name: 'Đúng giờ D5',
      targetValue: '≤ 5 phút',
    },
  });

  // Expired company setup
  const expEmpUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Exp Emp',
      phone: `096${stamp}`.slice(0, 10),
      email: `expemp_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  const expMem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyExpired.id,
      userId: expEmpUser.id,
      isAdmin: true,
      isActive: true,
    },
  });
  expiredSla = await prisma.contractSLA.create({
    data: {
      corporateId: companyExpired.id,
      code: `OLD_${stamp}`,
      name: 'SLA cũ',
    },
  });
  expiredBooking = await prisma.corporateBooking.create({
    data: {
      corporateId: companyExpired.id,
      employeeId: expMem.id,
      purpose: 'old contract trip',
      pickupAt: new Date(Date.now() - 100 * 86400_000),
      returnAt: new Date(Date.now() - 99 * 86400_000),
      pickupAddress: 'A',
      dropoffAddress: 'B',
      basePrice: 1_000_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      status: 'CONFIRMED',
    },
  });
  // Confirmed CRITICAL on expired contract — must not count
  await prisma.sLAViolation.create({
    data: {
      corporateBookingId: expiredBooking.id,
      slaId: expiredSla.id,
      reportedBy: 'employee',
      reportedById: expMem.id,
      description: 'Old CRITICAL',
      severity: 'CRITICAL',
      isConfirmed: true,
      resolvedAt: new Date(Date.now() - 90 * 86400_000),
      createdAt: new Date(Date.now() - 90 * 86400_000),
    },
  });
  await prisma.sLAViolation.create({
    data: {
      corporateBookingId: expiredBooking.id,
      slaId: expiredSla.id,
      reportedBy: 'employee',
      reportedById: expMem.id,
      description: 'Old CRITICAL 2',
      severity: 'CRITICAL',
      isConfirmed: true,
      resolvedAt: new Date(Date.now() - 80 * 86400_000),
      createdAt: new Date(Date.now() - 80 * 86400_000),
    },
  });
});

afterAll(async () => {
  for (const c of [companyA, companyB, companyExpired]) {
    if (c) await prisma.corporateClient.delete({ where: { id: c.id } }).catch(() => {});
  }
  if (interpreter) await prisma.valueAddedService.delete({ where: { id: interpreter.id } }).catch(() => {});
  for (const u of [otorentAdmin, employeeA1, employeeA2, corpAdminA, c2cUser]) {
    if (u) await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
});

describe('ENT-Day 5 — Security VAS', () => {
  test('employeeA1 cannot delete VAS on employeeA2 booking → 403', async () => {
    const add = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBookingA2.id}/vas`)
      .set('Authorization', `Bearer ${employeeA2Token}`)
      .send({ vasId: interpreter.id, headcount: 1 });
    expect(add.status).toBe(201);
    const vasLineId = add.body.data.bookingVas.id;

    const res = await request(app)
      .delete(`${BASE}/corporate/bookings/${pendingBookingA2.id}/vas/${vasLineId}`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(403);
  });

  test('corpAdminA cannot assign VAS provider (OtoRent Admin only) → 403', async () => {
    const add = await request(app)
      .post(`${BASE}/corporate/bookings/${pendingBookingA1.id}/vas`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ vasId: interpreter.id, headcount: 1 });
    expect(add.status).toBe(201);
    const vasLineId = add.body.data.bookingVas.id;

    const res = await request(app)
      .put(
        `${BASE}/admin/corporate-bookings/${pendingBookingA1.id}/vas/${vasLineId}/assign`
      )
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ providerId: 1 });
    expect(res.status).toBe(403);
  });

  test('unauth GET /vas → 200; unauth GET /corporate/me/vas-pricing → 401', async () => {
    const pub = await request(app).get(`${BASE}/vas`);
    expect(pub.status).toBe(200);
    const priv = await request(app).get(`${BASE}/corporate/me/vas-pricing`);
    expect(priv.status).toBe(401);
  });
});

describe('ENT-Day 5 — Security SLA', () => {
  test('employeeA1 cannot list violations of company B booking → 403', async () => {
    // Create a booking under company B
    const memB = await prisma.corporateEmployee.findFirst({
      where: { corporateId: companyB.id },
    });
    const bookingB = await prisma.corporateBooking.create({
      data: {
        corporateId: companyB.id,
        employeeId: memB.id,
        purpose: 'b trip',
        pickupAt: new Date(Date.now() + 2 * 3600_000),
        returnAt: new Date(Date.now() + 8 * 3600_000),
        pickupAddress: 'X',
        dropoffAddress: 'Y',
        basePrice: 500000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        status: 'IN_PROGRESS',
      },
    });
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${bookingB.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(403);
  });

  test('corpAdminA cannot confirm violation (OtoRent Admin only) → 403', async () => {
    const report = await request(app)
      .post(`${BASE}/corporate/bookings/${inProgressBooking.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaA.id,
        description: 'Late 10 min',
        severity: 'MINOR',
      });
    expect(report.status).toBe(201);
    const res = await request(app)
      .put(`${BASE}/admin/sla-violations/${report.body.data.violation.id}/confirm`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ resolution: 'nope' });
    expect(res.status).toBe(403);
  });

  test('corpAdminB cannot view SLA report of company A → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/sla-report`)
      .set('Authorization', `Bearer ${corpAdminBToken}`);
    expect(res.status).toBe(403);
  });
});

describe('ENT-Day 5 — Security Amendment + portal isolation', () => {
  test('C2C user cannot access /corporate/me/company → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/company`)
      .set('Authorization', `Bearer ${c2cToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /corporate/me/sla returns catalog + risk flags for member', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/sla`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.some((s) => s.id === slaA.id)).toBe(true);
    expect(typeof res.body.data.contractTerminationRisk).toBe('boolean');
  });

  test('unauth GET /corporate/me/sla → 401', async () => {
    const res = await request(app).get(`${BASE}/corporate/me/sla`);
    expect(res.status).toBe(401);
  });
});

describe('ENT-Day 5 — contractEnd window + CRITICAL email alert', () => {
  test('violations on expired contract do not count toward risk', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyExpired.id}/sla-report`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report.criticalCount).toBe(0);
    expect(res.body.data.report.contractTerminationRisk).toBe(false);
    expect(res.body.data.report.totalViolations).toBe(0);
  });

  test('confirm CRITICAL triggers sendEmail mock', async () => {
    sendEmailMock.mockClear();
    const report = await request(app)
      .post(`${BASE}/corporate/bookings/${inProgressBooking.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaA.id,
        description: 'CRITICAL driver misconduct',
        severity: 'CRITICAL',
      });
    expect(report.status).toBe(201);

    const conf = await request(app)
      .put(`${BASE}/admin/sla-violations/${report.body.data.violation.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'Cảnh cáo' });
    expect(conf.status).toBe(200);

    // Fire-and-forget — give microtask queue a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(sendEmailMock).toHaveBeenCalled();
    const call = sendEmailMock.mock.calls.find((c) =>
      String(c[0]?.subject || '').includes('CRITICAL')
    );
    expect(call).toBeTruthy();
  });

  test('cost-summary without VAS still returns base + vat (backward compat)', async () => {
    // Create a fresh booking with no VAS lines
    const bare = await prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId: empA1Mem.id,
        purpose: 'no vas',
        pickupAt: new Date(Date.now() + 20 * 3600_000),
        returnAt: new Date(Date.now() + 28 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 1_000_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        status: 'PENDING',
      },
    });
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${bare.id}/cost-summary`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.basePrice).toBe(1_000_000);
    expect(s.vasTotal).toBe(0);
    expect(Array.isArray(s.vas)).toBe(true);
    expect(s.vas).toHaveLength(0);
    expect(s.subtotal).toBe(1_000_000);
    expect(s.vat10).toBe(100_000);
    expect(s.total).toBe(1_100_000);
  });
});
