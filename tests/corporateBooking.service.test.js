// tests/corporateBooking.service.test.js — B2B Day 3 service-layer branch coverage (UC-64/65/72).
//
// Drives corporateBookingService directly against real MySQL: create, list,
// getById guards, approve/reject/cancel transitions, admin list filters,
// assignDriver, startTrip, cost summary. Mirrors tripExpense.service.test.js.
import prisma from '../src/config/db.js';
import { corporateBookingService } from '../src/api/v1/corporate/corporateBooking.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);

let customerRole;
let company;
let inactiveCompany;
let expiredCompany;
let otherCompany;
let adminUser;
let empUser;
let driverUser;
let adminMembership; // isAdmin
let empMembership; // non-admin, has .user for notify
let otherEmpMembership;

const userIds = [];
const corpIds = [];
const bookingIds = [];

const soonPickup = () => new Date(Date.now() + 5 * 3600_000);
const soonReturn = () => new Date(Date.now() + 12 * 3600_000);

async function makeUser(prefix, over = {}) {
  const u = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: `${prefix} ${stamp}`,
      phone: `${prefix}${stamp}`.slice(0, 10),
      email: `${prefix}_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
      ...over,
    },
  });
  userIds.push(u.id);
  return u;
}

async function makeBooking(over = {}) {
  const b = await prisma.corporateBooking.create({
    data: {
      corporateId: company.id,
      employeeId: empMembership.id,
      pickupAt: soonPickup(),
      returnAt: soonReturn(),
      pickupAddress: 'A',
      dropoffAddress: 'B',
      basePrice: 1_000_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      status: 'PENDING',
      ...over,
    },
  });
  bookingIds.push(b.id);
  return b;
}

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'c' },
  });

  company = await prisma.corporateClient.create({
    data: {
      name: `BkCo ${stamp}`,
      taxCode: `84${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
    },
  });
  corpIds.push(company.id);

  inactiveCompany = await prisma.corporateClient.create({
    data: {
      name: `BkInactive ${stamp}`,
      taxCode: `85${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: false,
    },
  });
  corpIds.push(inactiveCompany.id);

  expiredCompany = await prisma.corporateClient.create({
    data: {
      name: `BkExpired ${stamp}`,
      taxCode: `86${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
      contractEnd: new Date('2020-01-01'),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
    },
  });
  corpIds.push(expiredCompany.id);

  otherCompany = await prisma.corporateClient.create({
    data: {
      name: `BkOther ${stamp}`,
      taxCode: `87${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  corpIds.push(otherCompany.id);

  adminUser = await makeUser('841');
  empUser = await makeUser('842');
  driverUser = await makeUser('843');

  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });
  const empRow = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: empUser.id, isAdmin: false, isActive: true },
  });
  // attach a .user so create()'s notify path reads membership.user?.fullName
  empMembership = { ...empRow, user: { id: empUser.id, fullName: empUser.fullName } };

  otherEmpMembership = await prisma.corporateEmployee.create({
    data: { corporateId: otherCompany.id, isAdmin: false, isActive: true },
  });
});

afterAll(async () => {
  await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('create', () => {
  test('inactive employee → EMPLOYEE_INACTIVE', async () => {
    await expect(
      corporateBookingService.create({ ...empMembership, isActive: false }, {})
    ).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE' });
  });

  test('inactive company → CLIENT_INACTIVE', async () => {
    await expect(
      corporateBookingService.create(
        { id: 1, corporateId: inactiveCompany.id, isActive: true, isAdmin: false },
        { pickupAt: soonPickup(), returnAt: soonReturn() }
      )
    ).rejects.toMatchObject({ code: 'CLIENT_INACTIVE' });
  });

  test('expired contract → CONTRACT_EXPIRED', async () => {
    await expect(
      corporateBookingService.create(
        { id: 1, corporateId: expiredCompany.id, isActive: true, isAdmin: false },
        { pickupAt: soonPickup(), returnAt: soonReturn() }
      )
    ).rejects.toMatchObject({ code: 'CONTRACT_EXPIRED' });
  });

  test('invalid date → INVALID_TIME_RANGE', async () => {
    await expect(
      corporateBookingService.create(empMembership, {
        pickupAt: 'not-a-date',
        returnAt: soonReturn(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
  });

  test('pickup < 2h away → BOOKING_TOO_SOON', async () => {
    await expect(
      corporateBookingService.create(empMembership, {
        pickupAt: new Date(Date.now() + 30 * 60_000),
        returnAt: soonReturn(),
      })
    ).rejects.toMatchObject({ code: 'BOOKING_TOO_SOON' });
  });

  test('return <= pickup → INVALID_TIME_RANGE', async () => {
    await expect(
      corporateBookingService.create(empMembership, {
        pickupAt: soonPickup(),
        returnAt: new Date(Date.now() + 3 * 3600_000),
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
  });

  test('happy path creates PENDING booking + notifies admins', async () => {
    const res = await corporateBookingService.create(empMembership, {
      purpose: 'Meeting',
      pickupAt: soonPickup(),
      returnAt: soonReturn(),
      pickupAddress: 'Q1',
      dropoffAddress: 'Q7',
      estimatedKm: 40,
      rentalType: 'full_day',
      vehicleType: '7_seat',
    });
    expect(res.status).toBe('PENDING');
    expect(res.basePrice).toBeGreaterThan(0);
    bookingIds.push(res.id);
  });
});

describe('list', () => {
  test('non-admin scoped to own employeeId', async () => {
    const { items } = await corporateBookingService.list(empMembership);
    expect(items.every((b) => b.employeeId === empMembership.id)).toBe(true);
  });

  test('admin can filter by employeeId, status and month', async () => {
    const { items, page, size } = await corporateBookingService.list(adminMembership, {
      employeeId: empMembership.id,
      status: 'PENDING',
      month: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`,
    });
    expect(page).toBe(1);
    expect(size).toBe(20);
    expect(items.every((b) => b.status === 'PENDING')).toBe(true);
  });

  test('malformed month is ignored', async () => {
    const { items } = await corporateBookingService.list(adminMembership, { month: 'garbage' });
    expect(Array.isArray(items)).toBe(true);
  });
});

describe('getById guards', () => {
  test('unknown → 404', async () => {
    await expect(corporateBookingService.getById(empMembership, 999_999_999)).rejects.toMatchObject(
      { statusCode: 404 }
    );
  });

  test('another company → 403', async () => {
    const foreign = await makeBooking({
      corporateId: otherCompany.id,
      employeeId: otherEmpMembership.id,
    });
    await expect(corporateBookingService.getById(empMembership, foreign.id)).rejects.toMatchObject(
      { statusCode: 403 }
    );
  });

  test("non-admin on another employee's booking → 403", async () => {
    const b = await makeBooking({ employeeId: adminMembership.id });
    await expect(corporateBookingService.getById(empMembership, b.id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('approve', () => {
  test('non-admin → 403', async () => {
    const b = await makeBooking();
    await expect(corporateBookingService.approve(empMembership, b.id, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('non-PENDING → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    await expect(corporateBookingService.approve(adminMembership, b.id, {})).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  test('happy approve sets APPROVED + optional vehicle/driver', async () => {
    const b = await makeBooking();
    const res = await corporateBookingService.approve(adminMembership, b.id, { driverId: driverUser.id });
    expect(res.status).toBe('APPROVED');
    expect(res.driverId).toBe(driverUser.id);
  });
});

describe('reject', () => {
  test('non-admin → 403', async () => {
    const b = await makeBooking();
    await expect(
      corporateBookingService.reject(empMembership, b.id, { reason: 'no' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('missing reason → REASON_REQUIRED', async () => {
    const b = await makeBooking();
    await expect(
      corporateBookingService.reject(adminMembership, b.id, { reason: '  ' })
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  test('non-PENDING → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    await expect(
      corporateBookingService.reject(adminMembership, b.id, { reason: 'busy' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  test('happy reject → CANCELLED with reason', async () => {
    const b = await makeBooking();
    const res = await corporateBookingService.reject(adminMembership, b.id, { reason: 'hết xe' });
    expect(res.status).toBe('CANCELLED');
  });
});

describe('cancel', () => {
  test("non-admin cancelling another's booking → 403", async () => {
    const b = await makeBooking({ employeeId: adminMembership.id });
    // getById already 403s for non-admin foreign booking
    await expect(corporateBookingService.cancel(empMembership, b.id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('IN_PROGRESS → CANNOT_CANCEL_IN_PROGRESS', async () => {
    const b = await makeBooking({ status: 'IN_PROGRESS' });
    await expect(corporateBookingService.cancel(adminMembership, b.id)).rejects.toMatchObject({
      code: 'CANNOT_CANCEL_IN_PROGRESS',
    });
  });

  test('non-cancellable status → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking({ status: 'CONFIRMED' });
    await expect(corporateBookingService.cancel(adminMembership, b.id)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  test('pickup < 2h away → CANCEL_TOO_LATE', async () => {
    const b = await makeBooking({ pickupAt: new Date(Date.now() + 30 * 60_000) });
    await expect(corporateBookingService.cancel(adminMembership, b.id)).rejects.toMatchObject({
      code: 'CANCEL_TOO_LATE',
    });
  });

  test('happy cancel → CANCELLED', async () => {
    const b = await makeBooking();
    const res = await corporateBookingService.cancel(empMembership, b.id);
    expect(res.status).toBe('CANCELLED');
  });
});

describe('adminList filters', () => {
  test('applies corporateId/status/from/to + awaitingDriverRelease', async () => {
    const res = await corporateBookingService.adminList({
      corporateId: company.id,
      status: 'PENDING',
      from: '2020-01-01',
      to: '2999-12-31',
      page: 1,
      size: 10,
    });
    expect(res.page).toBe(1);
    expect(res.items.every((b) => b.corporateId === company.id)).toBe(true);

    const awaiting = await corporateBookingService.adminList({ awaitingDriverRelease: 'true' });
    expect(awaiting.items.every((b) => b.status === 'DRIVER_ASSIGNED')).toBe(true);
  });
});

describe('assignDriver', () => {
  test('missing driverId → DRIVER_REQUIRED', async () => {
    const b = await makeBooking();
    await expect(corporateBookingService.assignDriver(b.id, {})).rejects.toMatchObject({
      code: 'DRIVER_REQUIRED',
    });
  });

  test('unknown booking → 404', async () => {
    await expect(
      corporateBookingService.assignDriver(999_999_999, { driverId: driverUser.id })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('started/locked status → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking({ status: 'IN_PROGRESS' });
    await expect(
      corporateBookingService.assignDriver(b.id, { driverId: driverUser.id })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  test('unknown driver → 404', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    await expect(
      corporateBookingService.assignDriver(b.id, { driverId: 999_999_999 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('unknown vehicle → 404', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    await expect(
      corporateBookingService.assignDriver(b.id, { driverId: driverUser.id, vehicleId: 999_999_999 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('happy assign returns driver', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    const res = await corporateBookingService.assignDriver(b.id, { driverId: driverUser.id });
    expect(res.driverId).toBe(driverUser.id);
    expect(res.driver.id).toBe(driverUser.id);
  });
});

describe('startTrip', () => {
  test('unknown → 404', async () => {
    await expect(corporateBookingService.startTrip(999_999_999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('non-APPROVED → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking({ status: 'PENDING' });
    await expect(corporateBookingService.startTrip(b.id)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  test('APPROVED → IN_PROGRESS', async () => {
    const b = await makeBooking({ status: 'APPROVED' });
    const res = await corporateBookingService.startTrip(b.id);
    expect(res.status).toBe('IN_PROGRESS');
  });
});

describe('getPriceConfigForMembership / costSummary', () => {
  test('getPriceConfigForMembership parses config', async () => {
    const cfg = await corporateBookingService.getPriceConfigForMembership(empMembership);
    expect(cfg).toBeTruthy();
  });

  test('costSummary returns totals for own booking', async () => {
    const b = await makeBooking();
    const summary = await corporateBookingService.costSummary(empMembership, b.id);
    expect(summary.basePrice).toBe(1_000_000);
    expect(summary.total).toBeGreaterThanOrEqual(1_000_000);
  });
});
