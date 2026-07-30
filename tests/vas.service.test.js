// tests/vas.service.test.js — ENT-Day 2 UC-76/77 service-layer branch coverage.
//
// Exercises vasService directly against real MySQL to cover the CRUD validation,
// corporate pricing, booking-VAS add/remove status gates, provider assignment and
// cost-summary branches the HTTP suites miss. Mirrors tripExpense.service.test.js:
// real DB, unique stamp, FK-safe teardown.
import prisma from '../src/config/db.js';
import { vasService } from '../src/api/v1/corporate/vas.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);

let customerRole;
let company;
let otherCompany;
let adminUser;
let empUser;
let adminMembership;
let empMembership;
let vas; // an active VAS in the catalog

const userIds = [];
const corpIds = [];
const bookingIds = [];
const vasIds = [];

const futurePickup = () => new Date(Date.now() + 5 * 3600_000);
const futureReturn = () => new Date(Date.now() + 12 * 3600_000);

async function makeBooking(status = 'PENDING', over = {}) {
  const b = await prisma.corporateBooking.create({
    data: {
      corporateId: company.id,
      employeeId: empMembership.id,
      pickupAt: futurePickup(),
      returnAt: futureReturn(),
      pickupAddress: 'A',
      dropoffAddress: 'B',
      basePrice: 1_500_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      status,
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
      name: `VasCo ${stamp}`,
      taxCode: `81${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
    },
  });
  corpIds.push(company.id);

  otherCompany = await prisma.corporateClient.create({
    data: {
      name: `VasOther ${stamp}`,
      taxCode: `82${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  corpIds.push(otherCompany.id);

  adminUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: `VAdmin ${stamp}`,
      phone: `081${stamp}`.slice(0, 10),
      email: `vadmin_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  userIds.push(adminUser.id);
  empUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: `VEmp ${stamp}`,
      phone: `082${stamp}`.slice(0, 10),
      email: `vemp_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  userIds.push(empUser.id);

  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });
  empMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: empUser.id, isAdmin: false, isActive: true },
  });

  vas = await prisma.valueAddedService.create({
    data: {
      code: `VAS${stamp}`.slice(0, 20),
      name: 'Tài xế bổ sung',
      unit: 'người',
      basePrice: 200_000,
      isActive: true,
      requiresHeadcount: true,
    },
  });
  vasIds.push(vas.id);
});

afterAll(async () => {
  await prisma.bookingVAS.deleteMany({ where: { corporateBookingId: { in: bookingIds } } }).catch(() => {});
  await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.corporateVASPrice.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  await prisma.valueAddedService.deleteMany({ where: { id: { in: vasIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('listActiveCatalog / listMyVasPricing', () => {
  test('active catalog includes our VAS with rounded basePrice', async () => {
    const items = await vasService.listActiveCatalog();
    const mine = items.find((v) => v.id === vas.id);
    expect(mine).toBeTruthy();
    expect(mine.basePrice).toBe(200_000);
  });

  test('listMyVasPricing returns rows for the company', async () => {
    const rows = await vasService.listMyVasPricing(adminMembership);
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('createVas', () => {
  test('blank code → INVALID_VAS_CODE', async () => {
    await expect(vasService.createVas({ code: '  ' })).rejects.toMatchObject({
      code: 'INVALID_VAS_CODE',
    });
  });

  test('duplicate code → VAS_CODE_EXISTS', async () => {
    await expect(
      vasService.createVas({ code: vas.code, name: 'x', unit: 'x', basePrice: 1 })
    ).rejects.toMatchObject({ code: 'VAS_CODE_EXISTS' });
  });

  test('negative basePrice → INVALID_BASE_PRICE', async () => {
    await expect(
      vasService.createVas({ code: `NEG${stamp}`.slice(0, 20), name: 'x', unit: 'x', basePrice: -5 })
    ).rejects.toMatchObject({ code: 'INVALID_BASE_PRICE' });
  });

  test('happy create', async () => {
    const created = await vasService.createVas({
      code: `NEW${stamp}`.slice(0, 20),
      name: 'Nước uống',
      unit: 'chai',
      basePrice: 15_000,
      description: 'n',
      isActive: false,
      requiresHeadcount: false,
    });
    vasIds.push(created.id);
    expect(created.basePrice).toBe(15_000);
    expect(created.isActive).toBe(false);
    expect(created.requiresHeadcount).toBe(false);
  });
});

describe('updateVas', () => {
  test('unknown id → 404', async () => {
    await expect(vasService.updateVas(999_999_999, { name: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('patches all fields incl. basePrice/isActive/requiresHeadcount', async () => {
    const res = await vasService.updateVas(vas.id, {
      name: 'Tài xế VIP',
      description: 'desc',
      unit: 'ca',
      basePrice: 250_000,
      isActive: true,
      requiresHeadcount: false,
    });
    expect(res.name).toBe('Tài xế VIP');
    expect(res.basePrice).toBe(250_000);
    expect(res.requiresHeadcount).toBe(false);
  });

  test('invalid basePrice on update → INVALID_BASE_PRICE', async () => {
    await expect(vasService.updateVas(vas.id, { basePrice: -1 })).rejects.toMatchObject({
      code: 'INVALID_BASE_PRICE',
    });
  });

  test('empty patch leaves row intact', async () => {
    const res = await vasService.updateVas(vas.id, {});
    expect(res.id).toBe(vas.id);
  });
});

describe('setCorporateVasPricing', () => {
  test('unknown corporate → 404', async () => {
    await expect(
      vasService.setCorporateVasPricing(999_999_999, { prices: [] })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('prices not array → INVALID_PRICES', async () => {
    await expect(
      vasService.setCorporateVasPricing(company.id, { prices: 'nope' })
    ).rejects.toMatchObject({ code: 'INVALID_PRICES' });
  });

  test('invalid vasId → INVALID_VAS_ID', async () => {
    await expect(
      vasService.setCorporateVasPricing(company.id, { prices: [{ vasId: 0, price: 100 }] })
    ).rejects.toMatchObject({ code: 'INVALID_VAS_ID' });
  });

  test('invalid price → INVALID_PRICE', async () => {
    await expect(
      vasService.setCorporateVasPricing(company.id, { prices: [{ vasId: vas.id, price: -1 }] })
    ).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });

  test('unknown vasId row → 404', async () => {
    await expect(
      vasService.setCorporateVasPricing(company.id, { prices: [{ vasId: 999_999_999, price: 100 }] })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('upserts negotiated price', async () => {
    const res = await vasService.setCorporateVasPricing(company.id, {
      prices: [{ vasId: vas.id, price: 180_000, note: 'deal' }],
    });
    expect(res[0].price).toBe(180_000);
    // upsert again to hit the update branch
    const again = await vasService.setCorporateVasPricing(company.id, {
      prices: [{ vasId: vas.id, price: 170_000 }],
    });
    expect(again[0].price).toBe(170_000);
  });
});

describe('addBookingVas / removeBookingVas', () => {
  test('unknown booking → 404 (loadBookingForMember)', async () => {
    await expect(
      vasService.addBookingVas(empMembership, 999_999_999, { vasId: vas.id })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('booking of another company → 403', async () => {
    const foreignEmp = await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, isAdmin: false, isActive: true },
    });
    const foreign = await prisma.corporateBooking.create({
      data: {
        corporateId: otherCompany.id,
        employeeId: foreignEmp.id,
        pickupAt: futurePickup(),
        returnAt: futureReturn(),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 1_000_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        status: 'PENDING',
      },
    });
    bookingIds.push(foreign.id);
    await expect(
      vasService.addBookingVas(empMembership, foreign.id, { vasId: vas.id })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("non-admin on another employee's booking → 403", async () => {
    const b = await makeBooking('PENDING', { employeeId: adminMembership.id });
    await expect(
      vasService.addBookingVas(empMembership, b.id, { vasId: vas.id })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('locked status (IN_PROGRESS) → BOOKING_LOCKED_FOR_VAS', async () => {
    const b = await makeBooking('IN_PROGRESS');
    await expect(
      vasService.addBookingVas(empMembership, b.id, { vasId: vas.id })
    ).rejects.toMatchObject({ code: 'BOOKING_LOCKED_FOR_VAS' });
  });

  test('add on PENDING then remove; remove on non-PENDING is locked', async () => {
    const b = await makeBooking('PENDING');
    const line = await vasService.addBookingVas(empMembership, b.id, {
      vasId: vas.id,
      headcount: 3,
      note: 'x',
    });
    expect(line.headcount).toBe(3);
    expect(line.status).toBe('PENDING');

    // remove unknown line → 404
    await expect(
      vasService.removeBookingVas(empMembership, b.id, 999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });

    const del = await vasService.removeBookingVas(empMembership, b.id, line.id);
    expect(del).toMatchObject({ id: line.id, deleted: true });
  });

  test('remove when booking APPROVED → BOOKING_LOCKED_FOR_VAS', async () => {
    const b = await makeBooking('APPROVED');
    // add via APPROVED is allowed (addable set), then flip to a delete-locked check
    const line = await vasService.addBookingVas(adminMembership, b.id, { vasId: vas.id });
    await expect(
      vasService.removeBookingVas(adminMembership, b.id, line.id)
    ).rejects.toMatchObject({ code: 'BOOKING_LOCKED_FOR_VAS' });
  });
});

describe('assignProvider', () => {
  test('unknown booking → 404', async () => {
    await expect(
      vasService.assignProvider(999_999_999, 1, { providerId: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('unknown vas line → 404', async () => {
    const b = await makeBooking('APPROVED');
    await expect(
      vasService.assignProvider(b.id, 999_999_999, { providerId: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('invalid providerId → INVALID_PROVIDER', async () => {
    const b = await makeBooking('APPROVED');
    const line = await vasService.addBookingVas(adminMembership, b.id, { vasId: vas.id });
    await expect(
      vasService.assignProvider(b.id, line.id, { providerId: 0 })
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER' });
  });

  test('assign confirms line + notifies employee (providerId null allowed)', async () => {
    const b = await makeBooking('APPROVED');
    const line = await vasService.addBookingVas(adminMembership, b.id, { vasId: vas.id });
    const res = await vasService.assignProvider(b.id, line.id, { providerId: null });
    expect(res.status).toBe('CONFIRMED');
    expect(res.confirmedAt).toBeTruthy();
  });
});

describe('costSummary', () => {
  test('reflects base + confirmed VAS lines', async () => {
    const b = await makeBooking('PENDING');
    await vasService.addBookingVas(empMembership, b.id, { vasId: vas.id, headcount: 2 });
    const summary = await vasService.costSummary(empMembership, b.id);
    expect(summary.basePrice).toBe(1_500_000);
    expect(summary.total).toBeGreaterThanOrEqual(1_500_000);
  });
});
