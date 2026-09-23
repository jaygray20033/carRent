// tests/settlement.test.js — B2B Day 5 integration + email mock
import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

// Mock email BEFORE app import so settlement.service binds the mock.
const sendEmailMock = jest.fn(async () => ({
  sent: true,
  messageId: 'mock-msg',
  attachments: 1,
}));
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
let corpAdminA;
let corpAdminAToken;
let corpAdminB;
let corpAdminBToken;
let empA;
let empAMem;
let settlement;
let confirmedBookingIds = [];

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
      phone: `040${stamp}`.slice(0, 10),
      email: `otd5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `SetCoA ${stamp}`,
      taxCode: `41${stamp}`.slice(0, 10),
      contactEmail: `ops_a_${stamp}@assethub.vn`,
      contactName: 'Ops A',
      contractRef: 'HĐ-2026/CCDV',
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `SetCoB ${stamp}`,
      taxCode: `42${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A D5',
      phone: `041${stamp}`.slice(0, 10),
      email: `ada5_${stamp}@ex.com`,
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

  empA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A D5',
      phone: `042${stamp}`.slice(0, 10),
      email: `empa5_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  empAMem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: empA.id,
      isAdmin: false,
      isActive: true,
      employeeCode: 'AH-01',
    },
  });

  corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B D5',
      phone: `043${stamp}`.slice(0, 10),
      email: `adb5_${stamp}@ex.com`,
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

  // Seed CONFIRMED bookings in April 2026 + CANCELLED + outside period
  const mkBooking = async (opts) => {
    const b = await prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId: empAMem.id,
        pickupAt: opts.pickupAt,
        returnAt: new Date(opts.pickupAt.getTime() + 8 * 3600_000),
        completedAt: opts.completedAt || opts.pickupAt,
        pickupAddress: 'Quan 1',
        dropoffAddress: 'Hai Phong',
        basePrice: opts.basePrice,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        estimatedKm: 150,
        status: opts.status,
        finalAmount: opts.finalAmount ?? null,
        confirmedByEmployee: true,
        confirmedByCorporateAdmin: true,
        confirmedByOtorent: true,
      },
    });
    if (opts.expense) {
      await prisma.tripExpense.create({
        data: {
          corporateBookingId: b.id,
          type: opts.expense.type,
          amount: opts.expense.amount,
          recordedBy: 'employee',
          approvedByAdmin: true,
        },
      });
    }
    return b;
  };

  const b1 = await mkBooking({
    pickupAt: new Date('2026-04-05T08:00:00.000Z'),
    basePrice: 1_100_000,
    finalAmount: 1_265_000,
    status: 'CONFIRMED',
    expense: { type: 'TOLL_ROAD', amount: 50_000 },
  });
  const b2 = await mkBooking({
    pickupAt: new Date('2026-04-18T08:00:00.000Z'),
    basePrice: 900_000,
    finalAmount: 990_000,
    status: 'CONFIRMED',
  });
  await mkBooking({
    pickupAt: new Date('2026-04-20T08:00:00.000Z'),
    basePrice: 600_000,
    status: 'CANCELLED',
  });
  await mkBooking({
    pickupAt: new Date('2026-03-10T08:00:00.000Z'),
    basePrice: 700_000,
    status: 'CONFIRMED', // outside April
  });

  confirmedBookingIds = [b1.id, b2.id];
});

afterAll(async () => {
  const corpIds = [companyA?.id, companyB?.id].filter(Boolean);
  if (corpIds.length) {
    await prisma.tripExpense
      .deleteMany({ where: { booking: { corporateId: { in: corpIds } } } })
      .catch(() => {});
    await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateSettlement.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  }
  const userIds = [otorentAdmin?.id, corpAdminA?.id, corpAdminB?.id, empA?.id].filter(Boolean);
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe('Create settlement', () => {
  test('creates DRAFT settlement and goms only CONFIRMED in period', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.999Z',
      });

    expect(res.status).toBe(201);
    settlement = res.body.data.settlement;
    expect(settlement.status).toBe('DRAFT');
    // 2 confirmed in April: base 1.1M + 0.9M = 2M; expenses 50k
    // subtotal 2.05M, VAT 205k, total 2.255M
    expect(settlement.totalBaseAmount).toBe(2_000_000);
    expect(settlement.totalExpenses).toBe(50_000);
    expect(settlement.totalVat).toBe(205_000);
    expect(settlement.totalAmount).toBe(2_255_000);
    expect(settlement.bookings.length).toBe(2);
    expect(settlement.bookings.every((b) => confirmedBookingIds.includes(b.id))).toBe(true);
  });

  test('overlapping period → 409 SETTLEMENT_PERIOD_OVERLAP', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        periodStart: '2026-04-15T00:00:00.000Z',
        periodEnd: '2026-05-15T00:00:00.000Z',
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SETTLEMENT_PERIOD_OVERLAP');
  });
});

describe('Send / confirm / dispute / mark-paid', () => {
  test('send DRAFT → SENT + email to contactEmail with attachment', async () => {
    sendEmailMock.mockClear();
    const res = await request(app)
      .put(`${BASE}/admin/settlements/${settlement.id}/send`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.settlement.status).toBe('SENT');

    expect(sendEmailMock).toHaveBeenCalled();
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe(companyA.contactEmail);
    expect(args.attachments).toBeTruthy();
    expect(args.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(args.attachments[0].content)).toBe(true);
    expect(args.attachments[0].content.length).toBeGreaterThan(0);
  });

  test('send again when not DRAFT → 409 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/settlements/${settlement.id}/send`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('corpAdminB confirm company A settlement → 403', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/settlements/${settlement.id}/confirm`)
      .set('Authorization', `Bearer ${corpAdminBToken}`);
    expect(res.status).toBe(403);
  });

  test('dispute without note → 422', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/settlements/${settlement.id}/dispute`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('dispute with note → DISPUTED', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/settlements/${settlement.id}/dispute`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ note: 'Sai so lieu chi phi cau duong' });
    expect(res.status).toBe(200);
    expect(res.body.data.settlement.status).toBe('DISPUTED');
  });

  test('confirm after dispute → CONFIRMED', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/settlements/${settlement.id}/confirm`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.settlement.status).toBe('CONFIRMED');
  });

  test('mark-paid when not CONFIRMED → 409 (create another DRAFT first)', async () => {
    // Create May settlement as DRAFT then try mark-paid
    const may = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        periodStart: '2026-05-01T00:00:00.000Z',
        periodEnd: '2026-05-31T23:59:59.999Z',
      });
    expect(may.status).toBe(201);
    const draftId = may.body.data.settlement.id;
    const res = await request(app)
      .put(`${BASE}/admin/settlements/${draftId}/mark-paid`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('mark-paid CONFIRMED → PAID', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/settlements/${settlement.id}/mark-paid`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ invoiceRef: 'HD-VAT-2026-04' });
    expect(res.status).toBe(200);
    expect(res.body.data.settlement.status).toBe('PAID');
    expect(res.body.data.settlement.invoiceRef).toBe('HD-VAT-2026-04');
  });
});

describe('Export PDF + list', () => {
  test('GET export → application/pdf non-empty', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/settlements/${settlement.id}/export`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const data = [];
        r.on('data', (c) => data.push(c));
        r.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    const buf = res.body;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  test('Corporate Admin lists own settlements', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/settlements`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.id === settlement.id)).toBe(true);
  });

  test('Admin list by client', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
