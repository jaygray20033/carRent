// tests/corporate-booking.test.js — B2B Day 3 integration + IDOR
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
let employeeA1;
let employeeA1Token;
let employeeA2;
let employeeA2Token;
let corpAdminB;
let corpAdminBToken;
let empA1Membership;
let bookingPending;
let bookingForReject;
let bookingForCancel;

const futurePickup = () => new Date(Date.now() + 5 * 3600_000);
const futureReturn = () => new Date(Date.now() + 12 * 3600_000);

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
      fullName: 'OT Admin D3',
      phone: `060${stamp}`.slice(0, 10),
      email: `otd3_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  // Company A
  const resA = await request(app)
    .post(`${BASE}/admin/corporate-clients`)
    .set('Authorization', `Bearer ${otorentAdminToken}`)
    .send({
      name: `CoA ${stamp}`,
      taxCode: `21${stamp}`.slice(0, 10),
      contractRef: 'HD-A',
      contractEnd: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
  companyA = resA.body.data.client;

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A D3',
      phone: `061${stamp}`.slice(0, 10),
      email: `ada_${stamp}@ex.com`,
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
      department: 'Ops',
    },
  });

  employeeA1 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A1 D3',
      phone: `062${stamp}`.slice(0, 10),
      email: `a1_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA1Token = sign(employeeA1.id);
  empA1Membership = await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA1.id,
      isAdmin: false,
      isActive: true,
      department: 'Sales',
    },
  });

  employeeA2 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A2 D3',
      phone: `063${stamp}`.slice(0, 10),
      email: `a2_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA2Token = sign(employeeA2.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA2.id,
      isAdmin: false,
      isActive: true,
    },
  });

  // Company B
  const resB = await request(app)
    .post(`${BASE}/admin/corporate-clients`)
    .set('Authorization', `Bearer ${otorentAdminToken}`)
    .send({
      name: `CoB ${stamp}`,
      taxCode: `22${stamp}`.slice(0, 10),
      contractEnd: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
  companyB = resB.body.data.client;

  corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B D3',
      phone: `064${stamp}`.slice(0, 10),
      email: `adb_${stamp}@ex.com`,
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
});

afterAll(async () => {
  const corpIds = [companyA?.id, companyB?.id].filter(Boolean);
  if (corpIds.length) {
    await prisma.tripExpense
      .deleteMany({ where: { booking: { corporateId: { in: corpIds } } } })
      .catch(() => {});
    await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
    await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  }
  const userIds = [
    otorentAdmin?.id,
    corpAdminA?.id,
    employeeA1?.id,
    employeeA2?.id,
    corpAdminB?.id,
  ].filter(Boolean);
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe('GET /corporate/me/price-config', () => {
  test('returns AssetHub default table', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/price-config`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.priceConfig['4_5_seat'].half_day_0_100km).toBe(
      DEFAULT_CORPORATE_PRICE_CONFIG['4_5_seat'].half_day_0_100km
    );
  });
});

describe('POST /corporate/bookings — happy path', () => {
  test('create → PENDING + basePrice 600_000 for 4_5 half_day 50km', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 50,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Q1 HCMC',
        dropoffAddress: 'Hai Phong',
        purpose: 'Gặp KH',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('PENDING');
    expect(res.body.data.booking.basePrice).toBe(600000);
    bookingPending = res.body.data.booking;

    // Corporate Admin got notification
    const notif = await prisma.notification.findFirst({
      where: { userId: corpAdminA.id, type: 'CORPORATE_BOOKING_CREATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).toBeTruthy();
  });

  test('create second booking for reject flow', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        vehicleType: '7_seat',
        rentalType: 'full_day',
        estimatedKm: 180,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quận 1 HCMC',
        dropoffAddress: 'Quận 7 HCMC',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.basePrice).toBe(1300000);
    bookingForReject = res.body.data.booking;
  });

  test('create third booking for cancel flow', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 40,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quận 3 HCMC',
        dropoffAddress: 'Quận 9 HCMC',
      });
    expect(res.status).toBe(201);
    bookingForCancel = res.body.data.booking;
  });

  test('employeeA2 creates own booking (for list isolation)', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeA2Token}`)
      .send({
        vehicleType: '16_seat',
        rentalType: 'half_day',
        estimatedKm: 120,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quận 2 HCMC',
        dropoffAddress: 'Binh Duong',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.basePrice).toBe(1200000);
  });
});

describe('Approve / Reject / Cancel', () => {
  test('Corporate Admin approve PENDING → APPROVED + notify employee', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingPending.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('APPROVED');

    const notif = await prisma.notification.findFirst({
      where: { userId: employeeA1.id, type: 'CORPORATE_BOOKING_APPROVED' },
    });
    expect(notif).toBeTruthy();
  });

  test('approve already APPROVED → 409 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingPending.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('reject without reason → 422', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingForReject.id}/reject`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('reject with reason → CANCELLED', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingForReject.id}/reject`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ reason: 'Không có xe phù hợp' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CANCELLED');
  });

  test('cancel IN_PROGRESS → 409 CANNOT_CANCEL_IN_PROGRESS', async () => {
    // Force status
    await prisma.corporateBooking.update({
      where: { id: bookingForCancel.id },
      data: { status: 'IN_PROGRESS' },
    });
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingForCancel.id}/cancel`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CANNOT_CANCEL_IN_PROGRESS');

    // restore to PENDING for cleanup
    await prisma.corporateBooking.update({
      where: { id: bookingForCancel.id },
      data: { status: 'PENDING' },
    });
  });

  test('employee cancel PENDING → CANCELLED', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${bookingForCancel.id}/cancel`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CANCELLED');
  });
});

describe('List visibility', () => {
  test('employee only sees own bookings', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((b) => b.employeeId === empA1Membership.id)).toBe(true);
    // Should not include A2's booking
    const a2 = await prisma.corporateEmployee.findFirst({
      where: { userId: employeeA2.id },
    });
    expect(res.body.data.some((b) => b.employeeId === a2.id)).toBe(false);
  });

  test('Corporate Admin sees all company bookings', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((b) => b.corporateId === companyA.id)).toBe(true);
  });
});

describe('IDOR', () => {
  test('corpAdminB approve booking company A → 403', async () => {
    // re-create a PENDING for this test
    const b = await prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId: empA1Membership.id,
        pickupAt: futurePickup(),
        returnAt: futureReturn(),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        estimatedKm: 50,
        status: 'PENDING',
      },
    });
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${b.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminBToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('employeeA1 GET booking of company B → 403', async () => {
    const empB = await prisma.corporateEmployee.findFirst({
      where: { userId: corpAdminB.id },
    });
    const b = await prisma.corporateBooking.create({
      data: {
        corporateId: companyB.id,
        employeeId: empB.id,
        pickupAt: futurePickup(),
        returnAt: futureReturn(),
        pickupAddress: 'X',
        dropoffAddress: 'Y',
        basePrice: 700000,
        rentalType: 'half_day',
        vehicleType: '7_seat',
        estimatedKm: 40,
        status: 'PENDING',
      },
    });
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${b.id}`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(403);
  });
});
