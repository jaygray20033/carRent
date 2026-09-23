// tests/sla.test.js — ENT-Day 3 SLA integration + IDOR
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
let corpAdminAToken;
let employeeA1Token;
let empA1Mem;
let corpAdminBToken;
let slaPunctuality;
let slaConduct;
let bookingInProgress;
let bookingPending;
let violation1;
let violation2;

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
      fullName: 'OT Admin SLA',
      phone: `070${stamp}`.slice(0, 10),
      email: `otsla_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `SLACoA ${stamp}`,
      taxCode: `61${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractStart: new Date(Date.now() - 30 * 86400_000),
      contractEnd: new Date(Date.now() + 300 * 86400_000),
      contactEmail: `contact_a_${stamp}@ex.com`,
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `SLACoB ${stamp}`,
      taxCode: `62${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  const corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A SLA',
      phone: `071${stamp}`.slice(0, 10),
      email: `adasla_${stamp}@ex.com`,
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

  const employeeA1 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A1 SLA',
      phone: `072${stamp}`.slice(0, 10),
      email: `a1sla_${stamp}@ex.com`,
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
      fullName: 'Admin B SLA',
      phone: `073${stamp}`.slice(0, 10),
      email: `adbsla_${stamp}@ex.com`,
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

  bookingInProgress = await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empA1Mem.id,
      purpose: 'sla trip',
      pickupAt: new Date(Date.now() - 2 * 3600_000),
      returnAt: new Date(Date.now() + 4 * 3600_000),
      pickupAddress: 'Q1',
      dropoffAddress: 'Q7',
      basePrice: 1_300_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      status: 'IN_PROGRESS',
    },
  });
  bookingPending = await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empA1Mem.id,
      purpose: 'pending',
      pickupAt: new Date(Date.now() + 5 * 3600_000),
      returnAt: new Date(Date.now() + 10 * 3600_000),
      pickupAddress: 'A',
      dropoffAddress: 'B',
      basePrice: 600000,
      rentalType: 'half_day',
      vehicleType: '4_5_seat',
      status: 'PENDING',
    },
  });
});

afterAll(async () => {
  if (companyA) await prisma.corporateClient.delete({ where: { id: companyA.id } }).catch(() => {});
  if (companyB) await prisma.corporateClient.delete({ where: { id: companyB.id } }).catch(() => {});
  if (otorentAdmin) await prisma.user.delete({ where: { id: otorentAdmin.id } }).catch(() => {});
});

describe('ENT-Day 3 — SLA CRUD admin', () => {
  test('POST /admin/corporate-clients/:id/sla creates SLA', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/sla`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        code: 'PUNCTUALITY',
        name: 'Đúng giờ',
        targetValue: '≤ 5 phút trễ',
        penaltyRule: 'Vi phạm 2 lần CRITICAL → chấm dứt HĐ',
      });
    expect(res.status).toBe(201);
    slaPunctuality = res.body.data.sla;

    const res2 = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/sla`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        code: 'DRIVER_CONDUCT',
        name: 'Thái độ tài xế',
        targetValue: 'Không khiếu nại',
      });
    expect(res2.status).toBe(201);
    slaConduct = res2.body.data.sla;
  });

  test('GET list SLA', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/sla`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  test('PUT update SLA', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-clients/${companyA.id}/sla/${slaPunctuality.id}`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ targetValue: '≤ 3 phút trễ' });
    expect(res.status).toBe(200);
    expect(res.body.data.sla.targetValue).toBe('≤ 3 phút trễ');
  });
});

describe('ENT-Day 3 — report + confirm violations', () => {
  test('report on PENDING booking → conflict (not reportable)', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${bookingPending.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaPunctuality.id,
        description: 'Tài xế đến trễ 20 phút',
        severity: 'MINOR',
      });
    expect(res.status).toBe(409);
  });

  test('report on IN_PROGRESS — Tài xế đến trễ 20 phút', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${bookingInProgress.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaPunctuality.id,
        description: 'Tài xế đến trễ 20 phút',
        severity: 'MINOR',
        evidenceUrls: ['https://example.com/proof1.jpg'],
      });
    expect(res.status).toBe(201);
    violation1 = res.body.data.violation;
    expect(violation1.isConfirmed).toBe(false);
  });

  test('report with slaId of another company → 403', async () => {
    // create SLA on company B
    const slaB = await prisma.contractSLA.create({
      data: {
        corporateId: companyB.id,
        code: `X_${stamp}`,
        name: 'Other',
      },
    });
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${bookingInProgress.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaB.id,
        description: 'cross company sla',
        severity: 'MINOR',
      });
    expect(res.status).toBe(403);
  });

  test('unconfirmed violation not in SLA report counts', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/sla-report`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report.totalViolations).toBe(0);
    expect(res.body.data.report.contractTerminationRisk).toBe(false);
  });

  test('admin confirm MINOR → report updates', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/sla-violations/${violation1.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'Nhắc nhở tài xế' });
    expect(res.status).toBe(200);
    expect(res.body.data.violation.isConfirmed).toBe(true);

    const report = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/sla-report`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(report.body.data.report.totalViolations).toBe(1);
    expect(report.body.data.report.criticalCount).toBe(0);
  });

  test('confirm already confirmed → 409 ALREADY_CONFIRMED', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/sla-violations/${violation1.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'again' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_CONFIRMED');
  });

  test('confirm CRITICAL #1 → warning, risk still false', async () => {
    const r = await request(app)
      .post(`${BASE}/corporate/bookings/${bookingInProgress.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaConduct.id,
        description: 'Tài xế thô lỗ với khách',
        severity: 'CRITICAL',
      });
    expect(r.status).toBe(201);
    violation2 = r.body.data.violation;

    const conf = await request(app)
      .put(`${BASE}/admin/sla-violations/${violation2.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'Cảnh cáo' });
    expect(conf.status).toBe(200);
    expect(conf.body.data.risk.warningFlag).toBe(true);
    expect(conf.body.data.risk.contractTerminationRisk).toBe(false);
  });

  test('confirm CRITICAL #2 → contractTerminationRisk=true', async () => {
    const r = await request(app)
      .post(`${BASE}/corporate/bookings/${bookingInProgress.id}/sla-violations`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        slaId: slaConduct.id,
        description: 'Tài xế tiết lộ lịch trình khách',
        severity: 'CRITICAL',
      });
    expect(r.status).toBe(201);
    const conf = await request(app)
      .put(`${BASE}/admin/sla-violations/${r.body.data.violation.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'Đủ điều kiện chấm dứt HĐ' });
    expect(conf.status).toBe(200);
    expect(conf.body.data.risk.contractTerminationRisk).toBe(true);

    const client = await prisma.corporateClient.findUnique({ where: { id: companyA.id } });
    expect(client.contractTerminationRisk).toBe(true);

    const report = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/sla-report`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(report.body.data.report.criticalCount).toBe(2);
    expect(report.body.data.report.contractTerminationRisk).toBe(true);
    expect(report.body.data.report.warningFlag).toBe(true);
  });
});

describe('ENT-Day 3 — SLA IDOR', () => {
  test('corpAdminB cannot list violations of company A booking → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${bookingInProgress.id}/sla-violations`)
      .set('Authorization', `Bearer ${corpAdminBToken}`);
    expect(res.status).toBe(403);
  });

  test('corpAdminA (not otorent) cannot create SLA → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/sla`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ code: 'X', name: 'Nope' });
    expect(res.status).toBe(403);
  });
});
