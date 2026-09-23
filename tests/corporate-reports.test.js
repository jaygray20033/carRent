// tests/corporate-reports.test.js — B2B Day 6 integration
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
let corpAdminA;
let corpAdminAToken;
let employeeA;
let employeeAToken;
let empMem;

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
      fullName: 'OT Admin D6',
      phone: `030${stamp}`.slice(0, 10),
      email: `otd6_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `RepCoA ${stamp}`,
      taxCode: `61${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `RepCoB ${stamp}`,
      taxCode: `62${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A D6',
      phone: `031${stamp}`.slice(0, 10),
      email: `ada6_${stamp}@ex.com`,
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

  employeeA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A D6',
      phone: `032${stamp}`.slice(0, 10),
      email: `empa6_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeAToken = sign(employeeA.id);
  empMem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA.id,
      isAdmin: false,
      isActive: true,
      employeeCode: 'R-01',
    },
  });

  // April + May trips
  await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empMem.id,
      pickupAt: new Date('2026-04-08T08:00:00.000Z'),
      returnAt: new Date('2026-04-08T16:00:00.000Z'),
      pickupAddress: 'Quan 1',
      dropoffAddress: 'Quan 7',
      basePrice: 600_000,
      rentalType: 'half_day',
      vehicleType: '4_5_seat',
      estimatedKm: 40,
      status: 'CONFIRMED',
      finalAmount: 660_000,
    },
  });
  await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empMem.id,
      pickupAt: new Date('2026-04-22T08:00:00.000Z'),
      returnAt: new Date('2026-04-22T18:00:00.000Z'),
      pickupAddress: 'Quan 3',
      dropoffAddress: 'Thu Duc',
      basePrice: 1_100_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      estimatedKm: 120,
      status: 'PENDING',
    },
  });
  await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empMem.id,
      pickupAt: new Date('2026-05-05T08:00:00.000Z'),
      returnAt: new Date('2026-05-05T14:00:00.000Z'),
      pickupAddress: 'Q5',
      dropoffAddress: 'Q10',
      basePrice: 600_000,
      rentalType: 'half_day',
      vehicleType: '4_5_seat',
      estimatedKm: 30,
      status: 'CONFIRMED',
      finalAmount: 660_000,
    },
  });
});

afterAll(async () => {
  const corpIds = [companyA?.id, companyB?.id].filter(Boolean);
  if (corpIds.length) {
    await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  }
  const userIds = [otorentAdmin?.id, corpAdminA?.id, employeeA?.id].filter(Boolean);
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe('GET /corporate/dashboard', () => {
  test('Corporate Admin sees own company data', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/dashboard`)
      .query({ month: '2026-04' })
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.corporate.id).toBe(companyA.id);
    expect(res.body.data.currentMonth.totalTrips).toBe(2);
    expect(res.body.data.currentMonth.pendingApproval).toBe(1);
  });

  test('regular employee → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/dashboard`)
      .set('Authorization', `Bearer ${employeeAToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /corporate/reports/trips', () => {
  test('CSV has UTF-8 BOM + headers + correct row count for month', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/reports/trips`)
      .query({ month: '2026-04' })
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const data = [];
        res.on('data', (c) => data.push(c));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const buf = res.body;
    // BOM = EF BB BF
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    const text = buf.toString('utf8');
    const lines = text.trim().split(/\r?\n/);
    // header + 2 april trips
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/ID/);
    expect(lines[0]).toMatch(/Nhân viên|Nhan vien|Nhân/i);
  });

  test('filter month=2026-05 → 1 row', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/reports/trips`)
      .query({ month: '2026-05' })
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const data = [];
        res.on('data', (c) => data.push(c));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect(res.status).toBe(200);
    const lines = res.body.toString('utf8').trim().split(/\r?\n/);
    expect(lines.length).toBe(2); // header + 1
  });
});

describe('Admin company dashboard', () => {
  test('OtoRent Admin can view any company dashboard', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/dashboard`)
      .query({ month: '2026-04' })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.currentMonth.totalTrips).toBe(2);
  });

  test('Corporate Admin calling admin endpoint → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients/${companyA.id}/dashboard`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(403);
  });
});
