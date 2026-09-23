// tests/tripExpense.service.test.js — B2B Day 4 service-layer coverage (UC-66/67/68).
//
// Exercises tripExpenseService directly against real MySQL — the CRUD / approval /
// completion / confirm-chain paths the HTTP suites reach only indirectly. Mirrors
// corporateClient.service.test.js: talk to the service, real DB, FK-safe teardown.
import prisma from '../src/config/db.js';
import { tripExpenseService } from '../src/api/v1/corporate/tripExpense.service.js';

const stamp = Date.now().toString().slice(-7);

let company;
let otherCompany;
let adminUser;
let empUser;
let adminMembership; // isAdmin true
let empMembership; // isAdmin false

const bookingIds = [];

const futurePickup = () => new Date(Date.now() + 5 * 3600_000);
const futureReturn = () => new Date(Date.now() + 12 * 3600_000);

/** Create a corporate booking owned by empMembership in a given status. */
async function makeBooking(status = 'IN_PROGRESS', over = {}) {
  const b = await prisma.corporateBooking.create({
    data: {
      corporateId: company.id,
      employeeId: empMembership.id,
      purpose: `trip ${status}`,
      pickupAt: futurePickup(),
      returnAt: futureReturn(),
      pickupAddress: 'Q1 HCMC',
      dropoffAddress: 'Tan Son Nhat',
      basePrice: 2_000_000,
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
  const customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'c' },
  });

  company = await prisma.corporateClient.create({
    data: {
      name: `ExpCo ${stamp}`,
      taxCode: `62${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  otherCompany = await prisma.corporateClient.create({
    data: {
      name: `OtherCo ${stamp}`,
      taxCode: `63${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });

  adminUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Exp Admin',
      phone: `081${stamp}`.slice(0, 10),
      email: `expadmin_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  empUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Exp Emp',
      phone: `082${stamp}`.slice(0, 10),
      email: `expemp_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });
  empMembership = await prisma.corporateEmployee.create({
    data: {
      corporateId: company.id,
      userId: empUser.id,
      isAdmin: false,
      isActive: true,
      employeeCode: 'EXP-01',
    },
  });
});

afterAll(async () => {
  const ids = [company?.id, otherCompany?.id].filter(Boolean);
  await prisma.tripExpense
    .deleteMany({ where: { booking: { corporateId: { in: ids } } } })
    .catch(() => {});
  await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: ids } } }).catch(() => {});
  await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: ids } } }).catch(() => {});
  const userIds = [adminUser?.id, empUser?.id].filter(Boolean);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.corporateClient.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('tripExpenseService — loadBookingForMember guards', () => {
  test('unknown booking → 404', async () => {
    await expect(
      tripExpenseService.listExpenses(empMembership, 999_999_999)
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
        purpose: 'foreign',
        pickupAt: futurePickup(),
        returnAt: futureReturn(),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 1_000_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        status: 'IN_PROGRESS',
      },
    });
    bookingIds.push(foreign.id);
    await expect(
      tripExpenseService.listExpenses(empMembership, foreign.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("non-admin on another employee's booking → 403", async () => {
    const b = await makeBooking('IN_PROGRESS', { employeeId: adminMembership.id });
    await expect(
      tripExpenseService.listExpenses(empMembership, b.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('tripExpenseService — addExpense', () => {
  test('adds a pending expense on an IN_PROGRESS booking', async () => {
    const b = await makeBooking('IN_PROGRESS');
    const exp = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'TOLL_ROAD',
      amount: 120_000,
      description: 'Cao tốc',
    });
    expect(exp.id).toBeGreaterThan(0);
    expect(exp.amount).toBe(120_000);
    expect(exp.approvedByAdmin).toBeNull();
  });

  test('rejects a locked booking → BOOKING_LOCKED', async () => {
    const b = await makeBooking('CONFIRMED');
    await expect(
      tripExpenseService.addExpense(empMembership, b.id, { type: 'PARKING', amount: 10_000 })
    ).rejects.toMatchObject({ code: 'BOOKING_LOCKED' });
  });

  test('rejects a non-open status → INVALID_STATUS_TRANSITION', async () => {
    const b = await makeBooking('APPROVED');
    await expect(
      tripExpenseService.addExpense(empMembership, b.id, { type: 'PARKING', amount: 10_000 })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  test('rejects an unknown expense type → INVALID_EXPENSE_TYPE', async () => {
    const b = await makeBooking('IN_PROGRESS');
    await expect(
      tripExpenseService.addExpense(empMembership, b.id, { type: 'BOGUS', amount: 10_000 })
    ).rejects.toMatchObject({ code: 'INVALID_EXPENSE_TYPE' });
  });

  test('rejects amount ≤ 0 → INVALID_AMOUNT', async () => {
    const b = await makeBooking('IN_PROGRESS');
    await expect(
      tripExpenseService.addExpense(empMembership, b.id, { type: 'PARKING', amount: 0 })
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });
});

describe('tripExpenseService — list / delete / approve', () => {
  test('listExpenses returns a cost summary (only approved count)', async () => {
    const b = await makeBooking('IN_PROGRESS');
    await tripExpenseService.addExpense(empMembership, b.id, { type: 'TOLL_ROAD', amount: 100_000 });
    const approved = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'PARKING',
      amount: 50_000,
    });
    await tripExpenseService.approveExpense(adminMembership, b.id, approved.id, { approved: true });

    const { expenses, summary } = await tripExpenseService.listExpenses(empMembership, b.id);
    expect(expenses.length).toBe(2);
    // Only the approved 50k counts toward subtotal (base 2M + 50k → VAT10 → total).
    expect(summary.expenseTotal).toBe(50_000);
    expect(summary.subtotal).toBe(2_050_000);
    expect(summary.total).toBe(2_255_000);
  });

  test('deleteExpense removes a pending expense; approved is protected', async () => {
    const b = await makeBooking('IN_PROGRESS');
    const pending = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'PARKING',
      amount: 20_000,
    });
    const del = await tripExpenseService.deleteExpense(empMembership, b.id, pending.id);
    expect(del).toMatchObject({ id: pending.id, deleted: true });

    const approved = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'TOLL_ROAD',
      amount: 30_000,
    });
    await tripExpenseService.approveExpense(adminMembership, b.id, approved.id, { approved: true });
    await expect(
      tripExpenseService.deleteExpense(empMembership, b.id, approved.id)
    ).rejects.toMatchObject({ code: 'EXPENSE_ALREADY_APPROVED' });

    await expect(
      tripExpenseService.deleteExpense(empMembership, b.id, 999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('approveExpense is Corporate-Admin only; unknown expense → 404', async () => {
    const b = await makeBooking('IN_PROGRESS');
    const exp = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'PARKING',
      amount: 15_000,
    });
    await expect(
      tripExpenseService.approveExpense(empMembership, b.id, exp.id, { approved: true })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      tripExpenseService.approveExpense(adminMembership, b.id, 999_999_999, { approved: true })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('attachReceipt echoes url on an open booking', async () => {
    const b = await makeBooking('IN_PROGRESS');
    const res = await tripExpenseService.attachReceipt(empMembership, b.id, 'http://x/r.jpg');
    expect(res).toMatchObject({ bookingId: b.id, receiptUrl: 'http://x/r.jpg' });
  });
});

describe('tripExpenseService — complete + confirm chain', () => {
  test('complete requires IN_PROGRESS and actualKm > 0 → PENDING_CONFIRM', async () => {
    const notReady = await makeBooking('APPROVED');
    await expect(
      tripExpenseService.complete(empMembership, notReady.id, { actualKm: 10 })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });

    const b = await makeBooking('IN_PROGRESS');
    await expect(
      tripExpenseService.complete(empMembership, b.id, { actualKm: 0 })
    ).rejects.toMatchObject({ code: 'ACTUAL_KM_REQUIRED' });

    const done = await tripExpenseService.complete(empMembership, b.id, {
      actualKm: 185,
      employeeNote: 'xong',
    });
    expect(done.status).toBe('PENDING_CONFIRM');
    expect(done.actualKm).toBe(185);
  });

  test('confirmEmployee only from PENDING_CONFIRM', async () => {
    const wrong = await makeBooking('IN_PROGRESS');
    await expect(
      tripExpenseService.confirmEmployee(empMembership, wrong.id)
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });

    const b = await makeBooking('PENDING_CONFIRM');
    const res = await tripExpenseService.confirmEmployee(empMembership, b.id);
    expect(res.confirmedByEmployee).toBe(true);
  });

  test('confirmCorporate: admin-only, needs employee confirm + all expenses reviewed', async () => {
    const b = await makeBooking('PENDING_CONFIRM');

    // Non-admin blocked.
    await expect(
      tripExpenseService.confirmCorporate(empMembership, b.id)
    ).rejects.toMatchObject({ statusCode: 403 });

    // Employee has not confirmed yet.
    await expect(
      tripExpenseService.confirmCorporate(adminMembership, b.id)
    ).rejects.toMatchObject({ code: 'EMPLOYEE_CONFIRM_REQUIRED' });

    await tripExpenseService.confirmEmployee(empMembership, b.id);

    // A pending (unreviewed) expense blocks corporate confirm.
    await prisma.corporateBooking.update({ where: { id: b.id }, data: { status: 'IN_PROGRESS' } });
    const pend = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'PARKING',
      amount: 40_000,
    });
    await prisma.corporateBooking.update({
      where: { id: b.id },
      data: { status: 'PENDING_CONFIRM' },
    });
    await expect(
      tripExpenseService.confirmCorporate(adminMembership, b.id)
    ).rejects.toMatchObject({ code: 'PENDING_EXPENSE_APPROVAL' });

    // Approve it → confirm succeeds, finalAmount computed, status CONFIRMED.
    await tripExpenseService.approveExpense(adminMembership, b.id, pend.id, { approved: true });
    const res = await tripExpenseService.confirmCorporate(adminMembership, b.id);
    expect(res.status).toBe('CONFIRMED');
    // base 2M + approved 40k = 2.04M subtotal → +10% VAT = 2.244M.
    expect(res.finalAmount).toBe(2_244_000);
  });

  test('confirmOtorent: needs corporate confirm; stamps confirmedByOtorent', async () => {
    await expect(
      tripExpenseService.confirmOtorent(999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });

    const notConfirmed = await makeBooking('PENDING_CONFIRM');
    await expect(
      tripExpenseService.confirmOtorent(notConfirmed.id)
    ).rejects.toMatchObject({ code: 'CORPORATE_CONFIRM_REQUIRED' });

    const ready = await makeBooking('CONFIRMED', {
      confirmedByEmployee: true,
      confirmedByCorporateAdmin: true,
    });
    const res = await tripExpenseService.confirmOtorent(ready.id);
    expect(res.confirmedByOtorent).toBe(true);
    expect(res.status).toBe('CONFIRMED');
  });

  test('costSummary reflects base + approved expenses + VAT', async () => {
    const b = await makeBooking('IN_PROGRESS');
    const exp = await tripExpenseService.addExpense(empMembership, b.id, {
      type: 'TOLL_ROAD',
      amount: 100_000,
    });
    await tripExpenseService.approveExpense(adminMembership, b.id, exp.id, { approved: true });
    const summary = await tripExpenseService.costSummary(empMembership, b.id);
    expect(summary.basePrice).toBe(2_000_000);
    expect(summary.expenseTotal).toBe(100_000);
    expect(summary.total).toBe(2_310_000);
  });
});
