// tests/trip-expense.test.js — B2B Day 4 integration + status + IDOR
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);
const sign = (id) => jwt.sign({ userId: id }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Minimal 1x1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
let empA1Mem;
let empA2Mem;
let trip; // main IN_PROGRESS booking for happy path
let lockedBooking; // CONFIRMED
let expenseToll;
let expenseParking;
let expenseReject;

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
      fullName: 'OT Admin D4',
      phone: `050${stamp}`.slice(0, 10),
      email: `otd4_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `ExpCoA ${stamp}`,
      taxCode: `31${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractEnd: new Date(Date.now() + 365 * 86400_000),
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `ExpCoB ${stamp}`,
      taxCode: `32${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A D4',
      phone: `051${stamp}`.slice(0, 10),
      email: `ada4_${stamp}@ex.com`,
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
      fullName: 'Emp A1 D4',
      phone: `052${stamp}`.slice(0, 10),
      email: `a1d4_${stamp}@ex.com`,
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
      fullName: 'Emp A2 D4',
      phone: `053${stamp}`.slice(0, 10),
      email: `a2d4_${stamp}@ex.com`,
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

  corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B D4',
      phone: `054${stamp}`.slice(0, 10),
      email: `adb4_${stamp}@ex.com`,
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

  const pickup = new Date(Date.now() + 5 * 3600_000);
  const ret = new Date(Date.now() + 12 * 3600_000);

  trip = await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empA1Mem.id,
      pickupAt: pickup,
      returnAt: ret,
      pickupAddress: 'Q1',
      dropoffAddress: 'HP',
      basePrice: 1_300_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      estimatedKm: 180,
      status: 'IN_PROGRESS',
    },
  });

  lockedBooking = await prisma.corporateBooking.create({
    data: {
      corporateId: companyA.id,
      employeeId: empA1Mem.id,
      pickupAt: pickup,
      returnAt: ret,
      pickupAddress: 'X',
      dropoffAddress: 'Y',
      basePrice: 600_000,
      rentalType: 'half_day',
      vehicleType: '4_5_seat',
      estimatedKm: 50,
      status: 'CONFIRMED',
      confirmedByEmployee: true,
      confirmedByCorporateAdmin: true,
      confirmedByOtorent: true,
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

describe('Expenses CRUD', () => {
  test('POST expense when CONFIRMED → 409 BOOKING_LOCKED', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${lockedBooking.id}/expenses`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ type: 'TOLL_ROAD', amount: 10000, description: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_LOCKED');
  });

  test('add TOLL_ROAD + PARKING on IN_PROGRESS trip', async () => {
    let res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/expenses`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ type: 'TOLL_ROAD', amount: 120000, description: 'Cầu Bạch Đằng x2' });
    expect(res.status).toBe(201);
    expenseToll = res.body.data.expense;
    expect(expenseToll.approvedByAdmin).toBeNull();

    res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/expenses`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ type: 'PARKING', amount: 50000, description: 'KS Pullman' });
    expenseParking = res.body.data.expense;

    res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/expenses`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ type: 'OTHER', amount: 30000, description: 'will reject' });
    expenseReject = res.body.data.expense;
  });

  test('upload receipt PNG → 200 + receiptUrl', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/upload-receipt`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .attach('image', PNG_1X1, { filename: 'receipt.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.receiptUrl).toBeTruthy();
  });

  test('upload non-image → 422 (real code maps 415→422)', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/upload-receipt`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(422);
  });

  test('complete missing actualKm → 422', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/complete`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('complete with actualKm → PENDING_CONFIRM', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/complete`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ actualKm: 195, employeeNote: 'OK' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('PENDING_CONFIRM');
    expect(res.body.data.booking.actualKm).toBe(195);

    const notif = await prisma.notification.findFirst({
      where: { userId: corpAdminA.id, type: 'CORPORATE_BOOKING_PENDING_CONFIRM' },
    });
    expect(notif).toBeTruthy();
  });
});

describe('Approve expenses + confirm chain', () => {
  test('confirm-corporate before expense review → 409 PENDING_EXPENSE_APPROVAL', async () => {
    // employee confirm first
    await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/confirm-employee`)
      .set('Authorization', `Bearer ${employeeA1Token}`);

    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/confirm-corporate`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PENDING_EXPENSE_APPROVAL');
  });

  test('confirm-otorent before confirm-corporate → 409', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${trip.id}/confirm-otorent`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CORPORATE_CONFIRM_REQUIRED');
  });

  test('admin approves/rejects expenses', async () => {
    let res = await request(app)
      .put(
        `${BASE}/corporate/bookings/${trip.id}/expenses/${expenseToll.id}/approve`
      )
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ approved: true });
    expect(res.status).toBe(200);
    expect(res.body.data.expense.approvedByAdmin).toBe(true);

    res = await request(app)
      .put(
        `${BASE}/corporate/bookings/${trip.id}/expenses/${expenseParking.id}/approve`
      )
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ approved: true });
    expect(res.status).toBe(200);

    res = await request(app)
      .put(
        `${BASE}/corporate/bookings/${trip.id}/expenses/${expenseReject.id}/approve`
      )
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ approved: false });
    expect(res.status).toBe(200);
    expect(res.body.data.expense.approvedByAdmin).toBe(false);
  });

  test('cost-summary excludes rejected expense + VAT 10%', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/bookings/${trip.id}/cost-summary`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    // base 1_300_000 + 120k + 50k = 1_470_000; rejected 30k excluded
    expect(s.basePrice).toBe(1_300_000);
    expect(s.expenseTotal).toBe(170_000);
    expect(s.subtotal).toBe(1_470_000);
    expect(s.vat10).toBe(147_000);
    expect(s.total).toBe(1_617_000);
    expect(s.expenses).toHaveLength(2);
  });

  test('confirm-corporate without employee confirm → 409 (reset flag)', async () => {
    await prisma.corporateBooking.update({
      where: { id: trip.id },
      data: { confirmedByEmployee: false },
    });
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/confirm-corporate`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMPLOYEE_CONFIRM_REQUIRED');
  });

  test('full confirm chain → CONFIRMED + confirmedByOtorent', async () => {
    await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/confirm-employee`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .expect(200);

    const corp = await request(app)
      .put(`${BASE}/corporate/bookings/${trip.id}/confirm-corporate`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(corp.status).toBe(200);
    expect(corp.body.data.booking.status).toBe('CONFIRMED');
    expect(corp.body.data.booking.confirmedByCorporateAdmin).toBe(true);
    expect(corp.body.data.booking.finalAmount).toBe(1_617_000);

    const ot = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${trip.id}/confirm-otorent`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(ot.status).toBe(200);
    expect(ot.body.data.booking.confirmedByOtorent).toBe(true);
    expect(ot.body.data.booking.status).toBe('CONFIRMED');
  });
});

describe('IDOR Day 4', () => {
  test('employeeA1 cannot touch employeeA2 booking expenses → 403', async () => {
    const b2 = await prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId: empA2Mem.id,
        pickupAt: new Date(Date.now() + 5 * 3600_000),
        returnAt: new Date(Date.now() + 10 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        estimatedKm: 40,
        status: 'IN_PROGRESS',
      },
    });
    const exp = await prisma.tripExpense.create({
      data: {
        corporateBookingId: b2.id,
        type: 'PARKING',
        amount: 20000,
        recordedBy: 'employee',
      },
    });

    const res = await request(app)
      .delete(`${BASE}/corporate/bookings/${b2.id}/expenses/${exp.id}`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(403);
  });

  test('corpAdminB upload receipt on company A booking → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings/${trip.id}/upload-receipt`)
      .set('Authorization', `Bearer ${corpAdminBToken}`)
      .attach('image', PNG_1X1, { filename: 'r.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});
