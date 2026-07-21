// tests/supplier-marketplace-flow.test.js
// Full marketplace flow:
//   DN book → approve → dispatch → supplier assign-driver →
//   OtoRent release-driver-info → start → complete → confirm → settle
//
// Also asserts white-label barriers:
//   - company cannot see supplierId / commission / driver before release
//   - supplier cannot see margin (basePrice / commissionRate / finalAmount)
//   - commissionAmount computed at settle = round(finalAmount × rate)
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';
import { DEFAULT_COMMISSION_RATE } from '../src/constants/supplier.js';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);
const sign = (id) => jwt.sign({ userId: id }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const futurePickup = () => new Date(Date.now() + 5 * 3600_000);
const futureReturn = () => new Date(Date.now() + 12 * 3600_000);

// ── Actors ──────────────────────────────────────────────────────────────
let adminRole;
let customerRole;
let supplierAdminRole;
let supplierDriverRole;

let otorentAdmin;
let otorentAdminToken;

let company;
let corpAdmin;
let corpAdminToken;
let employee;
let employeeToken;
let empMembership;

let supplier;
let supplierAdminUser;
let supplierAdminToken;
let supplierAdminMember;
let supplierDriverUser;
let supplierDriverToken;
let supplierDriverMember;

let booking;
const COMMISSION_RATE = 0.2; // 20% — explicit so we can assert the snapshot + settle math

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
  supplierAdminRole = await prisma.role.upsert({
    where: { code: 'SUPPLIER_ADMIN' },
    update: {},
    create: { code: 'SUPPLIER_ADMIN', name: 'Supplier Admin', description: 'sa' },
  });
  supplierDriverRole = await prisma.role.upsert({
    where: { code: 'SUPPLIER_DRIVER' },
    update: {},
    create: { code: 'SUPPLIER_DRIVER', name: 'Supplier Driver', description: 'sd' },
  });

  // OtoRent Admin
  otorentAdmin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'OT Admin MKT',
      phone: `070${stamp}`.slice(0, 10),
      email: `otmkt_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  // Corporate client + members
  company = await prisma.corporateClient.create({
    data: {
      name: `MktCo ${stamp}`,
      taxCode: `71${stamp}`.slice(0, 10),
      contactEmail: `ops_mkt_${stamp}@ex.com`,
      contactName: 'Ops MKT',
      contractRef: 'HĐ-MKT-2026',
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractEnd: new Date(Date.now() + 365 * 86400_000),
    },
  });

  corpAdmin = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Corp Admin MKT',
      phone: `071${stamp}`.slice(0, 10),
      email: `cadmkt_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminToken = sign(corpAdmin.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: company.id,
      userId: corpAdmin.id,
      isAdmin: true,
      isActive: true,
    },
  });

  employee = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp MKT',
      phone: `072${stamp}`.slice(0, 10),
      email: `empmkt_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeToken = sign(employee.id);
  empMembership = await prisma.corporateEmployee.create({
    data: {
      corporateId: company.id,
      userId: employee.id,
      isAdmin: false,
      isActive: true,
      employeeCode: 'MKT-01',
    },
  });

  // Supplier via admin API
  const supRes = await request(app)
    .post(`${BASE}/admin/suppliers`)
    .set('Authorization', `Bearer ${otorentAdminToken}`)
    .send({
      name: `Supplier MKT ${stamp}`,
      taxCode: `81${stamp}`.slice(0, 10),
      contactName: 'Supplier Boss',
      contactPhone: `073${stamp}`.slice(0, 10),
      contactEmail: `sup_${stamp}@ex.com`,
      commissionRate: COMMISSION_RATE,
      contractRef: 'HĐ-SUP-2026',
      contractEnd: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
  expect(supRes.status).toBe(201);
  supplier = supRes.body.data.supplier;
  expect(Number(supplier.commissionRate)).toBe(COMMISSION_RATE);

  // Supplier Admin user + invite/accept
  supplierAdminUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Supplier Admin MKT',
      phone: `074${stamp}`.slice(0, 10),
      email: `sadmin_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  supplierAdminToken = sign(supplierAdminUser.id);

  const inviteAdminRes = await request(app)
    .post(`${BASE}/admin/suppliers/${supplier.id}/members`)
    .set('Authorization', `Bearer ${otorentAdminToken}`)
    .send({
      phone: supplierAdminUser.phone,
      fullName: 'Supplier Admin MKT',
      isAdmin: true,
    });
  expect(inviteAdminRes.status).toBe(201);
  const adminInviteToken = inviteAdminRes.body.data.inviteToken;

  const acceptAdminRes = await request(app)
    .post(`${BASE}/supplier/invite/accept`)
    .set('Authorization', `Bearer ${supplierAdminToken}`)
    .send({ token: adminInviteToken });
  expect(acceptAdminRes.status).toBe(200);
  supplierAdminMember = acceptAdminRes.body.data.member;

  // Promote role is done by acceptInvite; refresh token is fine (JWT carries userId only)
  const adminUserAfter = await prisma.user.findUnique({
    where: { id: supplierAdminUser.id },
    include: { role: true },
  });
  expect(adminUserAfter.role.code).toBe('SUPPLIER_ADMIN');
  expect(supplierAdminRole.id).toBeTruthy();

  // Supplier Driver user + invite/accept
  supplierDriverUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Driver MKT',
      phone: `075${stamp}`.slice(0, 10),
      email: `sdriver_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  supplierDriverToken = sign(supplierDriverUser.id);

  const inviteDriverRes = await request(app)
    .post(`${BASE}/admin/suppliers/${supplier.id}/members`)
    .set('Authorization', `Bearer ${otorentAdminToken}`)
    .send({
      phone: supplierDriverUser.phone,
      fullName: 'Driver MKT',
      isAdmin: false,
    });
  expect(inviteDriverRes.status).toBe(201);
  const driverInviteToken = inviteDriverRes.body.data.inviteToken;

  const acceptDriverRes = await request(app)
    .post(`${BASE}/supplier/invite/accept`)
    .set('Authorization', `Bearer ${supplierDriverToken}`)
    .send({ token: driverInviteToken });
  expect(acceptDriverRes.status).toBe(200);
  supplierDriverMember = acceptDriverRes.body.data.member;

  const driverUserAfter = await prisma.user.findUnique({
    where: { id: supplierDriverUser.id },
    include: { role: true },
  });
  expect(driverUserAfter.role.code).toBe('SUPPLIER_DRIVER');
  expect(supplierDriverRole.id).toBeTruthy();
});

afterAll(async () => {
  // Clean up in FK-safe order
  if (company?.id) {
    await prisma.tripExpense
      .deleteMany({ where: { booking: { corporateId: company.id } } })
      .catch(() => {});
    await prisma.corporateBooking
      .deleteMany({ where: { corporateId: company.id } })
      .catch(() => {});
    await prisma.corporateSettlement
      .deleteMany({ where: { corporateId: company.id } })
      .catch(() => {});
    await prisma.corporateEmployee
      .deleteMany({ where: { corporateId: company.id } })
      .catch(() => {});
    await prisma.corporateClient.deleteMany({ where: { id: company.id } }).catch(() => {});
  }
  if (supplier?.id) {
    await prisma.supplierMember.deleteMany({ where: { supplierId: supplier.id } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { id: supplier.id } }).catch(() => {});
  }
  const userIds = [
    otorentAdmin?.id,
    corpAdmin?.id,
    employee?.id,
    supplierAdminUser?.id,
    supplierDriverUser?.id,
  ].filter(Boolean);
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe('Supplier Marketplace — full flow', () => {
  test('1. Employee creates booking → PENDING (no supplier leak)', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 50,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Q1 HCMC',
        dropoffAddress: 'Tan Son Nhat',
        purpose: 'Marketplace full flow',
      });

    expect(res.status).toBe(201);
    booking = res.body.data.booking;
    expect(booking.status).toBe('PENDING');
    expect(booking.basePrice).toBe(600000);
    // White-label: company never sees supplier fields
    expect(booking.supplierId).toBeUndefined();
    expect(booking.commissionRate).toBeUndefined();
    expect(booking.commissionAmount).toBeUndefined();
    expect(booking.dispatchedAt).toBeUndefined();
    expect(booking.releasedDriverInfo).toBeUndefined();
  });

  test('2. Corporate Admin approves → APPROVED', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/bookings/${booking.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('APPROVED');
    expect(res.body.data.booking.supplierId).toBeUndefined();
  });

  test('3. OtoRent Admin dispatches to supplier → DISPATCHED + rate snapshot', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${booking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id, note: 'Xe 5 chỗ, BSX 51A-99999' });

    expect(res.status).toBe(200);
    const b = res.body.data.booking;
    expect(b.status).toBe('DISPATCHED');
    expect(b.supplierId).toBe(supplier.id);
    expect(Number(b.commissionRate)).toBe(COMMISSION_RATE);
    expect(b.dispatchedAt).toBeTruthy();
    expect(b.dispatchRecordCode).toMatch(new RegExp(`^LDX-${booking.id}-`));

    // Company still cannot see supplier / commission after dispatch
    const corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.status).toBe(200);
    const cv = corpView.body.data.booking;
    expect(cv.status).toBe('DISPATCHED');
    expect(cv.supplierId).toBeUndefined();
    expect(cv.commissionRate).toBeUndefined();
    expect(cv.commissionAmount).toBeUndefined();
    expect(cv.dispatchedAt).toBeUndefined();
    expect(cv.releasedDriverInfo).toBeUndefined();
    expect(cv.driverInfoReleasedAt).toBeUndefined();
  });

  test('4. Supplier portal sees booking without margin or corporate identity', async () => {
    const res = await request(app)
      .get(`${BASE}/supplier/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${supplierAdminToken}`);
    expect(res.status).toBe(200);
    const b = res.body.data.booking;
    expect(b.status).toBe('DISPATCHED');
    // Margin hidden
    expect(b.basePrice).toBeUndefined();
    expect(b.commissionRate).toBeUndefined();
    expect(b.commissionAmount).toBeUndefined();
    expect(b.finalAmount).toBeUndefined();
    // Corporate identity hidden
    expect(b.corporate).toBeUndefined();
    expect(b.corporateId).toBeUndefined();
    expect(b.employee).toBeUndefined();
    expect(b.employeeId).toBeUndefined();
    // Operational fields still present
    expect(b.pickupAddress).toBe('Q1 HCMC');
    expect(b.dropoffAddress).toBe('Tan Son Nhat');
  });

  test('5. Supplier Admin assigns driver → DRIVER_ASSIGNED (company still blind)', async () => {
    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${booking.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({
        memberId: supplierDriverMember.id,
        vehicleNote: 'Toyota Vios trắng',
        licensePlate: '51A-99999',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('DRIVER_ASSIGNED');
    // Margin still hidden on supplier response
    expect(res.body.data.booking.basePrice).toBeUndefined();
    expect(res.body.data.booking.commissionRate).toBeUndefined();

    // Company still cannot see driver info
    const corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.status).toBe(200);
    const cv = corpView.body.data.booking;
    expect(cv.status).toBe('DRIVER_ASSIGNED');
    expect(cv.releasedDriverInfo).toBeUndefined();
    expect(cv.driverInfoReleasedAt).toBeUndefined();
    expect(cv.supplierId).toBeUndefined();
    expect(cv.supplierMemberId).toBeUndefined();
  });

  test('6. Start blocked before release-driver-info (DRIVER_INFO_NOT_RELEASED)', async () => {
    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${booking.id}/start`)
      .set('Authorization', `Bearer ${supplierDriverToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DRIVER_INFO_NOT_RELEASED');
  });

  test('7. OtoRent Admin releases driver info → company can see releasedDriverInfo only', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${booking.id}/release-driver-info`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});
    expect(res.status).toBe(200);
    const b = res.body.data.booking;
    expect(b.releasedDriverInfo).toEqual(
      expect.objectContaining({
        fullName: 'Driver MKT',
        phone: supplierDriverUser.phone,
      })
    );
    expect(b.driverInfoReleasedAt).toBeTruthy();

    // Company now sees releasedDriverInfo but still no supplier/margin
    const corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.status).toBe(200);
    const cv = corpView.body.data.booking;
    expect(cv.releasedDriverInfo).toEqual(
      expect.objectContaining({
        fullName: 'Driver MKT',
        phone: supplierDriverUser.phone,
      })
    );
    expect(cv.driverInfoReleasedAt).toBeTruthy();
    // White-label still holds
    expect(cv.supplierId).toBeUndefined();
    expect(cv.supplierMemberId).toBeUndefined();
    expect(cv.commissionRate).toBeUndefined();
    expect(cv.commissionAmount).toBeUndefined();
    expect(cv.dispatchedAt).toBeUndefined();
    expect(cv.dispatchedBy).toBeUndefined();
    expect(cv.driverInfoReleasedBy).toBeUndefined();
  });

  test('8. Supplier driver starts trip → IN_PROGRESS', async () => {
    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${booking.id}/start`)
      .set('Authorization', `Bearer ${supplierDriverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('IN_PROGRESS');
    expect(res.body.data.booking.basePrice).toBeUndefined();
  });

  test('9. Supplier driver completes trip → PENDING_CONFIRM', async () => {
    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${booking.id}/complete`)
      .set('Authorization', `Bearer ${supplierDriverToken}`)
      .send({ actualKm: 55, note: 'Xong chuyến' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('PENDING_CONFIRM');
  });

  test('10. Confirm chain: employee → corporate → otorent → CONFIRMED + finalAmount', async () => {
    // Employee confirm
    const empRes = await request(app)
      .put(`${BASE}/corporate/bookings/${booking.id}/confirm-employee`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empRes.status).toBe(200);
    expect(empRes.body.data.booking.confirmedByEmployee).toBe(true);

    // Corporate admin confirm → CONFIRMED + finalAmount
    const corpRes = await request(app)
      .put(`${BASE}/corporate/bookings/${booking.id}/confirm-corporate`)
      .set('Authorization', `Bearer ${corpAdminToken}`);
    expect(corpRes.status).toBe(200);
    expect(corpRes.body.data.booking.status).toBe('CONFIRMED');
    expect(corpRes.body.data.booking.finalAmount).toBeGreaterThan(0);
    // finalAmount = basePrice 600k + VAT 10% (no expenses) = 660_000
    expect(corpRes.body.data.booking.finalAmount).toBe(660_000);

    // OtoRent final stamp
    const otRes = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${booking.id}/confirm-otorent`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(otRes.status).toBe(200);
    expect(otRes.body.data.booking.confirmedByOtorent).toBe(true);
    expect(otRes.body.data.booking.status).toBe('CONFIRMED');
  });

  test('11. Settlement computes commissionAmount = round(finalAmount × rate)', async () => {
    // Anchor completedAt inside the settlement period so filterBookingsForPeriod picks it up
    const now = new Date();
    await prisma.corporateBooking.update({
      where: { id: booking.id },
      data: { completedAt: now, pickupAt: now },
    });

    const periodStart = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const periodEnd = new Date(now.getTime() + 24 * 3600_000).toISOString();

    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${company.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ periodStart, periodEnd });

    expect(res.status).toBe(201);
    const settlement = res.body.data.settlement;
    expect(settlement.status).toBe('DRAFT');
    expect(settlement.bookings.some((b) => b.id === booking.id)).toBe(true);

    // Reload booking from DB — commissionAmount must be set
    const settled = await prisma.corporateBooking.findUnique({ where: { id: booking.id } });
    expect(settled.status).toBe('SETTLED');
    expect(Number(settled.commissionRate)).toBe(COMMISSION_RATE);
    // 660_000 × 0.2 = 132_000
    expect(settled.commissionAmount).toBe(Math.round(660_000 * COMMISSION_RATE));
    expect(settled.commissionAmount).toBe(132_000);

    // Company still cannot see commission fields after settle
    const corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.status).toBe(200);
    expect(corpView.body.data.booking.commissionRate).toBeUndefined();
    expect(corpView.body.data.booking.commissionAmount).toBeUndefined();
    expect(corpView.body.data.booking.supplierId).toBeUndefined();
  });

  test('12. Supplier /me omits commissionRate; DEFAULT_COMMISSION_RATE is 0.15', async () => {
    expect(DEFAULT_COMMISSION_RATE).toBe(0.15);
    const res = await request(app)
      .get(`${BASE}/supplier/me`)
      .set('Authorization', `Bearer ${supplierAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.supplier.id).toBe(supplier.id);
    expect(res.body.data.supplier.commissionRate).toBeUndefined();
    expect(res.body.data.membership.isAdmin).toBe(true);
  });
});

describe('Supplier Marketplace — edge cases', () => {
  let edgeBooking;

  test('dispatch to inactive supplier → 409 SUPPLIER_INACTIVE', async () => {
    // Create + approve a fresh booking
    const createRes = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 40,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Q3 HCMC',
        dropoffAddress: 'Q7 HCMC',
      });
    expect(createRes.status).toBe(201);
    edgeBooking = createRes.body.data.booking;

    const approveRes = await request(app)
      .put(`${BASE}/corporate/bookings/${edgeBooking.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});
    expect(approveRes.status).toBe(200);

    // Temporarily deactivate supplier
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { isActive: false },
    });

    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${edgeBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SUPPLIER_INACTIVE');

    // Restore
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { isActive: true },
    });
  });

  test('dispatch to terminationRisk supplier → 409 SUPPLIER_TERMINATION_RISK', async () => {
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { terminationRisk: true },
    });

    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${edgeBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SUPPLIER_TERMINATION_RISK');

    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { terminationRisk: false },
    });
  });

  test('recall after dispatch → APPROVED + clears supplier fields', async () => {
    const dispatchRes = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${edgeBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.data.booking.status).toBe('DISPATCHED');

    const recallRes = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${edgeBooking.id}/recall`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ reason: 'Test recall' });
    expect(recallRes.status).toBe(200);
    const b = recallRes.body.data.booking;
    expect(b.status).toBe('APPROVED');
    expect(b.supplierId).toBeNull();
    expect(b.commissionRate).toBeNull();
    expect(b.supplierMemberId).toBeNull();
  });

  test('supplier reject after re-dispatch → APPROVED + clears supplier fields', async () => {
    const dispatchRes = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${edgeBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    expect(dispatchRes.status).toBe(200);

    const rejectRes = await request(app)
      .put(`${BASE}/supplier/bookings/${edgeBooking.id}/reject`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ reason: 'Không có xe phù hợp' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.booking.status).toBe('APPROVED');

    // DB: supplier fields cleared
    const raw = await prisma.corporateBooking.findUnique({ where: { id: edgeBooking.id } });
    expect(raw.supplierId).toBeNull();
    expect(raw.commissionRate).toBeNull();
  });
});

describe('Supplier Marketplace — re-assign / re-dispatch / cancel', () => {
  let reBooking;
  let secondDriver;
  let secondDriverMember;

  beforeAll(async () => {
    // Second driver for re-assign tests
    secondDriver = await prisma.user.create({
      data: {
        roleId: (await prisma.role.findUnique({ where: { code: 'CUSTOMER' } })).id,
        fullName: 'Driver Two MKT',
        phone: `076${stamp}`.slice(0, 10),
        email: `sdriver2_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    const inviteRes = await request(app)
      .post(`${BASE}/admin/suppliers/${supplier.id}/members`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ phone: secondDriver.phone, fullName: 'Driver Two MKT', isAdmin: false });
    expect(inviteRes.status).toBe(201);
    const acceptRes = await request(app)
      .post(`${BASE}/supplier/invite/accept`)
      .set('Authorization', `Bearer ${sign(secondDriver.id)}`)
      .send({ token: inviteRes.body.data.inviteToken });
    expect(acceptRes.status).toBe(200);
    secondDriverMember = acceptRes.body.data.member;
  });

  afterAll(async () => {
    if (secondDriver?.id) {
      await prisma.notification.deleteMany({ where: { userId: secondDriver.id } }).catch(() => {});
      await prisma.supplierMember.deleteMany({ where: { userId: secondDriver.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: secondDriver.id } }).catch(() => {});
    }
  });

  async function createApprovedBooking() {
    const createRes = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 30,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Q5 HCMC',
        dropoffAddress: 'Q10 HCMC',
      });
    expect(createRes.status).toBe(201);
    const b = createRes.body.data.booking;
    const approveRes = await request(app)
      .put(`${BASE}/corporate/bookings/${b.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});
    expect(approveRes.status).toBe(200);
    return b;
  }

  test('re-assign driver before release overwrites member, keeps DRIVER_ASSIGNED', async () => {
    reBooking = await createApprovedBooking();
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${reBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });

    await request(app)
      .put(`${BASE}/supplier/bookings/${reBooking.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ memberId: supplierDriverMember.id });

    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${reBooking.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ memberId: secondDriverMember.id, vehicleNote: 'Xe 2' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('DRIVER_ASSIGNED');

    const raw = await prisma.corporateBooking.findUnique({ where: { id: reBooking.id } });
    expect(raw.supplierMemberId).toBe(secondDriverMember.id);
    expect(raw.driverInfoReleasedAt).toBeNull();
  });

  test('re-assign after release clears releasedDriverInfo + forces re-release', async () => {
    // release first driver
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${reBooking.id}/release-driver-info`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});

    // company can see driver
    let corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${reBooking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.body.data.booking.releasedDriverInfo).toBeTruthy();

    // re-assign to original driver → must clear release
    const res = await request(app)
      .put(`${BASE}/supplier/bookings/${reBooking.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ memberId: supplierDriverMember.id });
    expect(res.status).toBe(200);

    const raw = await prisma.corporateBooking.findUnique({ where: { id: reBooking.id } });
    expect(raw.supplierMemberId).toBe(supplierDriverMember.id);
    expect(raw.driverInfoReleasedAt).toBeNull();
    expect(raw.releasedDriverInfo).toBeNull();

    // company no longer sees driver
    corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${reBooking.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.body.data.booking.releasedDriverInfo).toBeUndefined();

    // start blocked until re-release
    const startRes = await request(app)
      .put(`${BASE}/supplier/bookings/${reBooking.id}/start`)
      .set('Authorization', `Bearer ${supplierDriverToken}`);
    expect(startRes.status).toBe(409);
    expect(startRes.body.code).toBe('DRIVER_INFO_NOT_RELEASED');
  });

  test('re-dispatch to same supplier without recall clears assignment', async () => {
    // booking is DRIVER_ASSIGNED without release
    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${reBooking.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id, note: 're-dispatch' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('DISPATCHED');
    expect(res.body.data.booking.redispatched).toBe(true);

    const raw = await prisma.corporateBooking.findUnique({ where: { id: reBooking.id } });
    expect(raw.supplierMemberId).toBeNull();
    expect(raw.driverId).toBeNull();
    expect(raw.supplierId).toBe(supplier.id);
  });

  test('cancel DISPATCHED booking notifies supplier + status CANCELLED', async () => {
    const cancelRes = await request(app)
      .put(`${BASE}/corporate/bookings/${reBooking.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.booking.status).toBe('CANCELLED');

    const notif = await prisma.notification.findFirst({
      where: { userId: supplierAdminUser.id, type: 'SUPPLIER_BOOKING_CANCELLED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).toBeTruthy();
  });
});

describe('Supplier Marketplace — commission-report / LDX / filters / SLA', () => {
  test('commission-report returns settled booking with supplierPayout', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/suppliers/${supplier.id}/commission-report`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const report = res.body.data.report;
    expect(report.supplier.id).toBe(supplier.id);
    expect(report.bookingCount).toBeGreaterThanOrEqual(1);
    expect(report.totalCommission).toBeGreaterThan(0);
    expect(report.totalSupplierPayout).toBe(
      report.totalFinalAmount - report.totalCommission
    );
    const item = report.items.find((i) => i.bookingId === booking.id);
    expect(item).toBeTruthy();
    expect(item.commissionAmount).toBe(132_000);
    expect(item.supplierPayout).toBe(660_000 - 132_000);
    expect(item.dispatchRecordCode).toMatch(/^LDX-/);
  });

  test('export dispatch-record (Lệnh điều xe) for settled booking', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings/${booking.id}/dispatch-record`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const rec = res.body.data.dispatchRecord;
    expect(rec.dispatchRecordCode).toMatch(new RegExp(`^LDX-${booking.id}-`));
    expect(rec.supplier.id).toBe(supplier.id);
    expect(rec.booking.id).toBe(booking.id);
    expect(rec.financials.commissionAmount).toBe(132_000);
    expect(rec.financials.supplierPayout).toBe(528_000);
    // corporate identity is on LDX for OtoRent records
    expect(rec.corporate.id).toBe(company.id);
  });

  test('admin list filter awaitingDriverRelease', async () => {
    // Create a booking sitting at DRIVER_ASSIGNED without release
    const createRes = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 20,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quan 2 HCMC',
        dropoffAddress: 'Quan 9 HCMC',
      });
    const b = createRes.body.data.booking;
    await request(app)
      .put(`${BASE}/corporate/bookings/${b.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${b.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    await request(app)
      .put(`${BASE}/supplier/bookings/${b.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ memberId: supplierDriverMember.id });

    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings`)
      .query({ awaitingDriverRelease: 'true', supplierId: supplier.id })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data.items || res.body.data || []).map((x) => x.id);
    // paginated response shape: data is array or {items}
    const list = res.body.data.items || res.body.data;
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((x) => x.id === b.id)).toBe(true);
    // all returned are DRIVER_ASSIGNED without release
    for (const item of list) {
      expect(item.status).toBe('DRIVER_ASSIGNED');
      expect(item.driverInfoReleasedAt).toBeNull();
    }
  });

  test('self-fulfill (supplierId=null) auto-releases driver info', async () => {
    const createRes = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 25,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quan 1 HCMC',
        dropoffAddress: 'Quan 4 HCMC',
      });
    const b = createRes.body.data.booking;
    await request(app)
      .put(`${BASE}/corporate/bookings/${b.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});

    // OtoRent self-fulfill assign-driver then dispatch with no supplier
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${b.id}/assign-driver`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ driverId: otorentAdmin.id });

    const res = await request(app)
      .put(`${BASE}/admin/corporate-bookings/${b.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: null });
    expect(res.status).toBe(200);
    // stays APPROVED (self-fulfill), auto-release
    expect(res.body.data.booking.status).toBe('APPROVED');
    expect(res.body.data.booking.driverInfoReleasedAt).toBeTruthy();

    const corpView = await request(app)
      .get(`${BASE}/corporate/bookings/${b.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(corpView.body.data.booking.releasedDriverInfo).toEqual(
      expect.objectContaining({ fullName: 'OT Admin MKT' })
    );
    expect(corpView.body.data.booking.supplierId).toBeUndefined();
  });

  test('SLA: 2 confirmed CRITICAL on supplier bookings → terminationRisk', async () => {
    // Seed two CONFIRMED bookings fulfilled by this supplier + 2 CRITICAL violations
    const sla = await prisma.contractSLA.create({
      data: {
        corporateId: company.id,
        code: `CRIT_${stamp}`.slice(0, 20),
        name: 'Critical SLA MKT',
        isActive: true,
      },
    });

    const mkFulfilled = async () => {
      const b = await prisma.corporateBooking.create({
        data: {
          corporateId: company.id,
          employeeId: empMembership.id,
          pickupAt: futurePickup(),
          returnAt: futureReturn(),
          pickupAddress: 'A',
          dropoffAddress: 'B',
          basePrice: 600000,
          rentalType: 'half_day',
          vehicleType: '4_5_seat',
          estimatedKm: 50,
          status: 'CONFIRMED',
          supplierId: supplier.id,
          commissionRate: COMMISSION_RATE,
          confirmedByEmployee: true,
          confirmedByCorporateAdmin: true,
          confirmedByOtorent: true,
        },
      });
      const v = await prisma.sLAViolation.create({
        data: {
          corporateBookingId: b.id,
          slaId: sla.id,
          reportedBy: 'corporate_admin',
          reportedById: empMembership.id,
          description: 'Critical test violation',
          severity: 'CRITICAL',
        },
      });
      return v;
    };

    const v1 = await mkFulfilled();
    const v2 = await mkFulfilled();

    const c1 = await request(app)
      .put(`${BASE}/admin/sla-violations/${v1.id}/confirm`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ resolution: 'confirmed' });
    // endpoint may be nested differently — fall back to service if route shape differs
    if (c1.status === 404) {
      const { slaService } = await import('../src/api/v1/corporate/sla.service.js');
      const r1 = await slaService.confirmViolation(v1.id, { resolution: 'confirmed' });
      expect(r1.supplierRisk).toBeTruthy();
      const r2 = await slaService.confirmViolation(v2.id, { resolution: 'confirmed' });
      expect(r2.supplierRisk?.contractTerminationRisk || r2.supplierRisk?.terminationRisk).toBe(
        true
      );
    } else {
      expect(c1.status).toBe(200);
      const c2 = await request(app)
        .put(`${BASE}/admin/sla-violations/${v2.id}/confirm`)
        .set('Authorization', `Bearer ${otorentAdminToken}`)
        .send({ resolution: 'confirmed' });
      expect(c2.status).toBe(200);
    }

    const sup = await prisma.supplier.findUnique({ where: { id: supplier.id } });
    expect(sup.criticalViolationCount).toBeGreaterThanOrEqual(2);
    expect(sup.terminationRisk).toBe(true);

    // Restore so other suites aren't poisoned if re-run in same DB
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { criticalViolationCount: 0, terminationRisk: false },
    });
  });

  test('export dispatch-record as PDF (?format=pdf)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings/${booking.id}/dispatch-record`)
      .query({ format: 'pdf' })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/LDX-/);
    // PDF magic bytes %PDF
    const buf = res.body instanceof Buffer ? res.body : Buffer.from(res.body);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  test('export dispatch-record as CSV (?format=csv)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-bookings/${booking.id}/dispatch-record`)
      .query({ format: 'csv' })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const text = res.text || res.body.toString();
    expect(text).toMatch(/dispatchRecordCode/);
    expect(text).toMatch(new RegExp(`LDX-${booking.id}-`));
    // commission 132000 + payout 528000 present in the row
    expect(text).toMatch(/132000/);
    expect(text).toMatch(/528000/);
  });

  test('start/complete notify Employee + Corp Admin (white-label)', async () => {
    // Fresh booking through release so we can start
    const createRes = await request(app)
      .post(`${BASE}/corporate/bookings`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 35,
        pickupAt: futurePickup().toISOString(),
        returnAt: futureReturn().toISOString(),
        pickupAddress: 'Quan 6 HCMC',
        dropoffAddress: 'Quan 8 HCMC',
      });
    const b = createRes.body.data.booking;
    await request(app)
      .put(`${BASE}/corporate/bookings/${b.id}/approve`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({});
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${b.id}/dispatch`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ supplierId: supplier.id });
    await request(app)
      .put(`${BASE}/supplier/bookings/${b.id}/assign-driver`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send({ memberId: supplierDriverMember.id });
    await request(app)
      .put(`${BASE}/admin/corporate-bookings/${b.id}/release-driver-info`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});

    await request(app)
      .put(`${BASE}/supplier/bookings/${b.id}/start`)
      .set('Authorization', `Bearer ${supplierDriverToken}`);

    const startNotif = await prisma.notification.findFirst({
      where: { userId: employee.id, type: 'CORPORATE_TRIP_STARTED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(startNotif).toBeTruthy();
    expect(startNotif.body).not.toMatch(/Supplier|nhà cung cấp/i);

    await request(app)
      .put(`${BASE}/supplier/bookings/${b.id}/complete`)
      .set('Authorization', `Bearer ${supplierDriverToken}`)
      .send({ actualKm: 40 });

    const doneNotif = await prisma.notification.findFirst({
      where: { userId: corpAdmin.id, type: 'CORPORATE_TRIP_COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(doneNotif).toBeTruthy();
  });
});

describe('Supplier Marketplace — payout (SupplierSettlement) workflow', () => {
  // The `booking` from the full-flow suite is SETTLED with finalAmount 660k /
  // commission 132k / supplierPayout 528k, completedAt anchored to ~now.
  // A payout period spanning the last day → next day captures exactly it.
  const period = () => ({
    periodStart: new Date(Date.now() - 86400_000).toISOString().slice(0, 10),
    periodEnd: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
  });
  let settlementId;

  const validDocs = {
    vatInvoiceRef: 'HĐ-2026-000123',
    vatInvoiceUrl: 'https://docs.example.com/vat/123.pdf',
    statementUrl: 'https://docs.example.com/bangke/123.xlsx',
    dispatchRecordsUrl: 'https://docs.example.com/ldx/123.zip',
  };

  test('admin creates payout period → PENDING_DOCUMENTS with correct totals', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/suppliers/${supplier.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send(period());
    expect(res.status).toBe(201);
    const s = res.body.data.settlement;
    settlementId = s.id;
    expect(s.status).toBe('PENDING_DOCUMENTS');
    expect(s.totalFinalAmount).toBe(660_000);
    expect(s.totalCommissionAmount).toBe(132_000);
    expect(s.supplierPayout).toBe(528_000);
    expect(s.bookings.some((b) => b.id === booking.id)).toBe(true);
  });

  test('booking is attached to the payout period (supplierSettlementId set)', async () => {
    const b = await prisma.corporateBooking.findUnique({ where: { id: booking.id } });
    expect(b.supplierSettlementId).toBe(settlementId);
  });

  test('overlapping period is rejected (SUPPLIER_SETTLEMENT_PERIOD_OVERLAP)', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/suppliers/${supplier.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send(period());
    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toBe(
      'SUPPLIER_SETTLEMENT_PERIOD_OVERLAP'
    );
  });

  test('supplier can view own payout period; foreign supplier is forbidden', async () => {
    const mine = await request(app)
      .get(`${BASE}/supplier/settlements/${settlementId}`)
      .set('Authorization', `Bearer ${supplierAdminToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.settlement.id).toBe(settlementId);

    // Admin scoping: a mismatched supplier id in the path must 403.
    const otherSupplier = await prisma.supplier.create({
      data: { name: `Other MKT ${stamp}`, isActive: true },
    });
    const cross = await request(app)
      .get(`${BASE}/admin/suppliers/${otherSupplier.id}/settlements/${settlementId}`)
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(cross.status).toBe(403);
    await prisma.supplier.delete({ where: { id: otherSupplier.id } }).catch(() => {});
  });

  test('verify before documents submitted → 409 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/suppliers/${supplier.id}/settlements/${settlementId}/verify`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error?.code || res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('non-admin supplier member cannot submit documents', async () => {
    const res = await request(app)
      .post(`${BASE}/supplier/settlements/${settlementId}/documents`)
      .set('Authorization', `Bearer ${supplierDriverToken}`)
      .send(validDocs);
    // requireSupplierAdmin blocks the driver (403).
    expect(res.status).toBe(403);
  });

  test('supplier admin submits documents → DOCUMENTS_SUBMITTED', async () => {
    const res = await request(app)
      .post(`${BASE}/supplier/settlements/${settlementId}/documents`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send(validDocs);
    expect(res.status).toBe(200);
    expect(res.body.data.settlement.status).toBe('DOCUMENTS_SUBMITTED');
    expect(res.body.data.settlement.vatInvoiceRef).toBe(validDocs.vatInvoiceRef);
  });

  test('mark-paid before verify → 409 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/suppliers/${supplier.id}/settlements/${settlementId}/mark-paid`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ paymentReference: 'EARLY-PAY' });
    expect(res.status).toBe(409);
  });

  test('admin rejects documents → DOCUMENTS_REJECTED, supplier resubmits', async () => {
    const rej = await request(app)
      .put(`${BASE}/admin/suppliers/${supplier.id}/settlements/${settlementId}/reject`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ reason: 'Bảng kê thiếu số chuyến' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.settlement.status).toBe('DOCUMENTS_REJECTED');
    expect(rej.body.data.settlement.rejectionReason).toMatch(/Bảng kê/);

    const resub = await request(app)
      .post(`${BASE}/supplier/settlements/${settlementId}/documents`)
      .set('Authorization', `Bearer ${supplierAdminToken}`)
      .send(validDocs);
    expect(resub.status).toBe(200);
    expect(resub.body.data.settlement.status).toBe('DOCUMENTS_SUBMITTED');
  });

  test('admin verifies → VERIFIED then mark-paid → PAID', async () => {
    const ver = await request(app)
      .put(`${BASE}/admin/suppliers/${supplier.id}/settlements/${settlementId}/verify`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({});
    expect(ver.status).toBe(200);
    expect(ver.body.data.settlement.status).toBe('VERIFIED');
    expect(ver.body.data.settlement.verifiedBy).toBe(otorentAdmin.id);

    const paid = await request(app)
      .put(`${BASE}/admin/suppliers/${supplier.id}/settlements/${settlementId}/mark-paid`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ paymentReference: 'CK-2026-07-21-001' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.settlement.status).toBe('PAID');
    expect(paid.body.data.settlement.paymentReference).toBe('CK-2026-07-21-001');
    expect(paid.body.data.settlement.paidAt).toBeTruthy();
  });

  test('supplier admin sees PAID period in own list', async () => {
    const res = await request(app)
      .get(`${BASE}/supplier/settlements`)
      .query({ status: 'PAID' })
      .set('Authorization', `Bearer ${supplierAdminToken}`);
    expect(res.status).toBe(200);
    const list = res.body.data.items || res.body.data;
    expect(list.some((x) => x.id === settlementId)).toBe(true);
  });

  test('creating a period with no eligible bookings → 422 NO_ELIGIBLE_BOOKINGS', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/suppliers/${supplier.id}/settlements`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ periodStart: '2020-01-01', periodEnd: '2020-01-31' });
    expect(res.status).toBe(422);
    expect(res.body.error?.code || res.body.code).toBe('NO_ELIGIBLE_BOOKINGS');
  });
});
