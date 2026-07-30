// tests/b2b-admin.test.js — B2B Day 7 UC-72/73 integration
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
let empA;
let empAMem;
let empB;
let empBMem;
let driverUser;
let vehicle;
let bookingApprovedA;
let bookingPendingA;
let bookingApprovedB;
let bookingInProgressA;
let c2cBooking;
let c2cPayment;

// current month window for list enrichment
const now = new Date();
const thisMonthPickup = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10, 8, 0, 0)
);

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
      fullName: 'OT Admin D7',
      phone: `070${stamp}`.slice(0, 10),
      email: `otd7_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  driverUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Tai Xe D7',
      phone: `071${stamp}`.slice(0, 10),
      email: `drv7_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  companyA = await prisma.corporateClient.create({
    data: {
      name: `AdminCoA ${stamp}`,
      taxCode: `71${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractEnd: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)),
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `AdminCoB ${stamp}`,
      taxCode: `72${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  empA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A D7',
      phone: `072${stamp}`.slice(0, 10),
      email: `empa7_${stamp}@ex.com`,
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
      employeeCode: 'D7-A',
    },
  });

  empB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp B D7',
      phone: `073${stamp}`.slice(0, 10),
      email: `empb7_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  empBMem = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyB.id,
      userId: empB.id,
      isAdmin: false,
      isActive: true,
    },
  });

  // Prefer an existing vehicle; create a minimal one if schema allows
  vehicle = await prisma.vehicle.findFirst({ where: { status: 'AVAILABLE' } });
  if (!vehicle) {
    vehicle = await prisma.vehicle.findFirst();
  }

  const mkCorpBooking = async (opts) =>
    prisma.corporateBooking.create({
      data: {
        corporateId: opts.corporateId,
        employeeId: opts.employeeId,
        pickupAt: opts.pickupAt || thisMonthPickup,
        returnAt: new Date((opts.pickupAt || thisMonthPickup).getTime() + 8 * 3600_000),
        pickupAddress: 'Quan 1 HCM',
        dropoffAddress: 'Quan 7 HCM',
        basePrice: opts.basePrice || 1_300_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        estimatedKm: 180,
        status: opts.status,
        finalAmount: opts.finalAmount ?? null,
        vehicleId: vehicle?.id ?? null,
        driverId: opts.driverId ?? null,
      },
    });

  bookingApprovedA = await mkCorpBooking({
    corporateId: companyA.id,
    employeeId: empAMem.id,
    status: 'APPROVED',
    basePrice: 1_300_000,
  });
  bookingPendingA = await mkCorpBooking({
    corporateId: companyA.id,
    employeeId: empAMem.id,
    status: 'PENDING',
    basePrice: 600_000,
  });
  bookingApprovedB = await mkCorpBooking({
    corporateId: companyB.id,
    employeeId: empBMem.id,
    status: 'APPROVED',
    basePrice: 900_000,
  });
  bookingInProgressA = await mkCorpBooking({
    corporateId: companyA.id,
    employeeId: empAMem.id,
    status: 'IN_PROGRESS',
    basePrice: 700_000,
  });

  // CONFIRMED B2B for revenue report
  await mkCorpBooking({
    corporateId: companyA.id,
    employeeId: empAMem.id,
    status: 'CONFIRMED',
    basePrice: 1_300_000,
    finalAmount: 1_617_000,
  });

  // Unpaid settlement for pendingSettlement KPI
  await prisma.corporateSettlement.create({
    data: {
      corporateId: companyA.id,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
      periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59)),
      totalBaseAmount: 1_000_000,
      totalExpenses: 0,
      totalVat: 100_000,
      totalAmount: 1_100_000,
      status: 'SENT',
    },
  });

  // C2C SUCCESS payment this month (must not mix into B2B)
  const c2cUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'C2C User D7',
      phone: `074${stamp}`.slice(0, 10),
      email: `c2c7_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  // Need a vehicle for C2C booking
  if (vehicle) {
    c2cBooking = await prisma.booking.create({
      data: {
        bookingCode: `D7C2C${stamp}`,
        userId: c2cUser.id,
        vehicleId: vehicle.id,
        pickupAt: thisMonthPickup,
        returnAt: new Date(thisMonthPickup.getTime() + 24 * 3600_000),
        totalDays: 1,
        pricePerDay: 500_000,
        totalAmount: 500_000,
        status: 'COMPLETED',
      },
    });
    c2cPayment = await prisma.payment.create({
      data: {
        bookingId: c2cBooking.id,
        userId: c2cUser.id,
        type: 'BOOKING',
        method: 'VNPAY',
        amount: 500_000,
        status: 'SUCCESS',
        paidAt: thisMonthPickup,
        txnRef: `D7PAY${stamp}`,
      },
    });
  }
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
  if (c2cPayment?.id) await prisma.payment.delete({ where: { id: c2cPayment.id } }).catch(() => {});
  if (c2cBooking?.id) await prisma.booking.delete({ where: { id: c2cBooking.id } }).catch(() => {});

  const userIds = [otorentAdmin?.id, empA?.id, empB?.id, driverUser?.id].filter(Boolean);
  // also clean c2c user by phone prefix
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { in: userIds } },
        { email: { contains: `_${stamp}@` } },
      ],
    },
  }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('GET /admin/corporate-bookings', () => {
  test('filter status=APPROVED → only APPROVED', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings`)
      .query({ status: 'APPROVED' })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const items = res.body.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((b) => b.status === 'APPROVED')).toBe(true);
  });

  test('filter corporateId=X → only that company', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings`)
      .query({ corporateId: companyA.id })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const items = res.body.data;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((b) => b.corporateId === companyA.id)).toBe(true);
  });
});

describe('PUT /admin/corporate-bookings/:id/assign-driver', () => {
  test('assign driver on APPROVED → notify employee', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${bookingApprovedA.id}/assign-driver`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        driverId: driverUser.id,
        vehicleId: vehicle?.id ?? undefined,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.driverId).toBe(driverUser.id);

    // notification to employee
    const notif = await prisma.notification.findFirst({
      where: {
        userId: empA.id,
        type: 'CORPORATE_DRIVER_ASSIGNED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).toBeTruthy();
    expect(notif.title).toMatch(/tài xế|tai xe|phân công/i);
  });

  test('assign on IN_PROGRESS → 409', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${bookingInProgressA.id}/assign-driver`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ driverId: driverUser.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('PUT /admin/corporate-bookings/:id/start', () => {
  test('start APPROVED → IN_PROGRESS', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${bookingApprovedA.id}/start`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('IN_PROGRESS');
  });

  test('start PENDING → 409', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${bookingPendingA.id}/start`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('GET /admin/reports/b2b-vs-c2c', () => {
  test('B2B + C2C totals non-negative and not mixed', async () => {
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const res = await request(app)
      .get(`${BASE}/admin/reports/b2b-vs-c2c`)
      .query({ month })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.b2b.total).toBeGreaterThanOrEqual(0);
    expect(data.c2c.total).toBeGreaterThanOrEqual(0);
    // Our seeded CONFIRMED B2B finalAmount 1_617_000 should be included
    expect(data.b2b.total).toBeGreaterThanOrEqual(1_617_000);
    // C2C SUCCESS 500k if payment created
    if (c2cPayment) {
      expect(data.c2c.total).toBeGreaterThanOrEqual(500_000);
    }
    // grand = sum of parts (no double count)
    expect(data.grandTotal).toBe(data.b2b.total + data.c2c.total);
    // B2B byCorporate should list company A
    const rowA = data.b2b.byCorporate.find((r) => r.corporateId === companyA.id);
    expect(rowA).toBeTruthy();
    expect(rowA.revenue).toBeGreaterThanOrEqual(1_617_000);
  });
});

describe('GET /admin/corporate-clients enriched', () => {
  test('each row has totalTripsThisMonth, totalRevenue, pendingSettlement', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients`)
      .query({ q: `AdminCoA ${stamp}` })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const items = res.body.data;
    expect(items.length).toBeGreaterThanOrEqual(1);
    const row = items.find((c) => c.id === companyA.id);
    expect(row).toBeTruthy();
    expect(typeof row.totalTripsThisMonth).toBe('number');
    expect(row.totalTripsThisMonth).toBeGreaterThanOrEqual(1);
    expect(typeof row.totalRevenue).toBe('number');
    expect(typeof row.pendingSettlement).toBe('number');
    expect(row.pendingSettlement).toBeGreaterThanOrEqual(1_100_000);
    expect(row.contractStatus).toBeDefined();
  });
});
