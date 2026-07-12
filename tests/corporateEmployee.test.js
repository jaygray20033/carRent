// tests/corporateEmployee.test.js — B2B Day 2 integration + authz (UC-61/62/63)
//
// Full flow:
//   OtoRent Admin creates company → seeds Corporate Admin → Admin invites employee
//   by phone → employee accepts invite → appears in list.
// Also covers TAX_CODE_CONFLICT, ALREADY_MEMBER, INVITE_EXPIRED, INVITE_ALREADY_USED,
// EMPLOYEE_HAS_ACTIVE_BOOKING, and Corporate Admin isolation across companies.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { DEFAULT_CORPORATE_PRICE_CONFIG } = await import(
  '../src/constants/corporatePricing.js'
);

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);
const signToken = (userId) =>
  jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let otorentAdmin;
let otorentAdminToken;

// Company A
let companyA;
let corpAdminA;
let corpAdminAToken;
let employeeA1;
let employeeA1Token;

// Company B (for isolation)
let companyB;
let corpAdminB;
let corpAdminBToken;

// Invite target (existing user, not yet a member)
let invitee;
let inviteeToken;

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Admin', description: 'Admin' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Customer', description: 'Customer' },
  });

  otorentAdmin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'OtoRent Admin B2B',
      phone: `080${stamp}`.slice(0, 10),
      email: `otadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = signToken(otorentAdmin.id);

  corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Corp Admin A',
      phone: `081${stamp}`.slice(0, 10),
      email: `corpadmin_a_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminAToken = signToken(corpAdminA.id);

  employeeA1 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Employee A1',
      phone: `082${stamp}`.slice(0, 10),
      email: `empa1_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA1Token = signToken(employeeA1.id);

  invitee = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Invitee User',
      phone: `083${stamp}`.slice(0, 10),
      email: `invitee_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  inviteeToken = signToken(invitee.id);

  corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Corp Admin B',
      phone: `084${stamp}`.slice(0, 10),
      email: `corpadmin_b_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminBToken = signToken(corpAdminB.id);
});

afterAll(async () => {
  // Best-effort cleanup of B2B rows created in this suite
  const taxCodes = [`01${stamp}`.slice(0, 10), `02${stamp}`.slice(0, 10), `03${stamp}`.slice(0, 10)];
  for (const tax of taxCodes) {
    const c = await prisma.corporateClient.findUnique({ where: { taxCode: tax } });
    if (c) {
      await prisma.tripExpense
        .deleteMany({ where: { booking: { corporateId: c.id } } })
        .catch(() => {});
      await prisma.corporateBooking.deleteMany({ where: { corporateId: c.id } }).catch(() => {});
      await prisma.corporateEmployee.deleteMany({ where: { corporateId: c.id } }).catch(() => {});
      await prisma.corporateSettlement.deleteMany({ where: { corporateId: c.id } }).catch(() => {});
      await prisma.corporateClient.delete({ where: { id: c.id } }).catch(() => {});
    }
  }
  const userIds = [
    otorentAdmin?.id,
    corpAdminA?.id,
    employeeA1?.id,
    invitee?.id,
    corpAdminB?.id,
  ].filter(Boolean);
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

// ── UC-61 Admin Corporate Clients ───────────────────────────────────

describe('POST /admin/corporate-clients', () => {
  test('OtoRent Admin creates AssetHub-style company', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        name: 'AssetHub Test A',
        taxCode: `01${stamp}`.slice(0, 10),
        address: 'Q1, HCMC',
        contactName: 'Nguyen A',
        contactPhone: '0901111222',
        contactEmail: `ops_a_${stamp}@assethub.vn`,
        contractRef: 'HĐ-2026/CCDV',
        creditLimit: 50_000_000,
        paymentTermDays: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.client.name).toBe('AssetHub Test A');
    expect(res.body.data.client.contractRef).toBe('HĐ-2026/CCDV');
    expect(res.body.data.client.priceConfig['4_5_seat']).toBeDefined();
    expect(res.body.data.client.priceConfig['4_5_seat'].half_day_0_100km).toBe(
      DEFAULT_CORPORATE_PRICE_CONFIG['4_5_seat'].half_day_0_100km
    );
    companyA = res.body.data.client;

    // Attach Corporate Admin A as active admin of company A
    await prisma.corporateEmployee.create({
      data: {
        corporateId: companyA.id,
        userId: corpAdminA.id,
        isAdmin: true,
        isActive: true,
        department: 'Ops',
        employeeCode: 'A-ADMIN',
        invitedPhone: corpAdminA.phone,
        inviteUsedAt: new Date(),
      },
    });
  });

  test('duplicate taxCode → 409 TAX_CODE_CONFLICT', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        name: 'Dup Co',
        taxCode: `01${stamp}`.slice(0, 10),
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TAX_CODE_CONFLICT');
  });

  test('invalid taxCode letters → 422', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ name: 'Bad Tax', taxCode: 'ABCDEFGHIJ' });
    expect(res.status).toBe(422);
  });

  test('customer cannot create corporate client → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ name: 'Nope', taxCode: '0999999999' });
    expect(res.status).toBe(403);
  });
});

describe('GET/PUT /admin/corporate-clients', () => {
  test('list + search by name', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/corporate-clients`)
      .query({ q: 'AssetHub Test A' })
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c) => c.id === companyA.id)).toBe(true);
  });

  test('update credit limit + contract', async () => {
    const res = await request(app)
      .put(`${BASE}/admin/corporate-clients/${companyA.id}`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({ creditLimit: 80_000_000, paymentTermDays: 45 });
    expect(res.status).toBe(200);
    expect(res.body.data.client.creditLimit).toBe(80_000_000);
    expect(res.body.data.client.paymentTermDays).toBe(45);
  });
});

// ── UC-62/63 Invite flow ────────────────────────────────────────────

describe('Corporate invite + accept flow', () => {
  let inviteToken;

  test('Corporate Admin invites existing user by phone', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({
        phone: invitee.phone,
        department: 'Sales',
        employeeCode: 'A-SALES-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.employee.isActive).toBe(false);
    expect(res.body.data.inviteToken).toBeTruthy();
    inviteToken = res.body.data.inviteToken;
  });

  test('invite same user again → 409 ALREADY_MEMBER (pending counts)', async () => {
    // First accept so they become a member, then re-invite should 409.
    // For pending: re-invite re-issues token (not 409). Spec says already member.
    // Invite a brand-new pending for employeeA1 after attaching them first.
    await prisma.corporateEmployee.create({
      data: {
        corporateId: companyA.id,
        userId: employeeA1.id,
        isAdmin: false,
        isActive: true,
        department: 'Sales',
        employeeCode: 'A-EMP-01',
        inviteUsedAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ phone: employeeA1.phone });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_MEMBER');
  });

  test('employeeA1 (non-admin) cannot invite → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${employeeA1Token}`)
      .send({ phone: '0900000999' });
    expect(res.status).toBe(403);
  });

  test('accept valid invite → isActive true', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/invite/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token: inviteToken });

    expect(res.status).toBe(200);
    expect(res.body.data.employee.isActive).toBe(true);
    expect(res.body.data.employee.corporateId).toBe(companyA.id);
    expect(res.body.data.employee.userId).toBe(invitee.id);
  });

  test('accept same token again → 409 INVITE_ALREADY_USED', async () => {
    const res = await request(app)
      .post(`${BASE}/corporate/invite/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token: inviteToken });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVITE_ALREADY_USED');
  });

  test('accept expired token → 410 INVITE_EXPIRED', async () => {
    // Create a fresh pending invite with past expiry
    const { generateInviteToken } = await import('../src/utils/corporateInvite.js');
    const token = generateInviteToken();
    const ghost = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Ghost Invitee',
        phone: `085${stamp}`.slice(0, 10),
        email: `ghost_${stamp}@example.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    await prisma.corporateEmployee.create({
      data: {
        corporateId: companyA.id,
        userId: ghost.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() - 60_000),
        invitedPhone: ghost.phone,
      },
    });

    const res = await request(app)
      .post(`${BASE}/corporate/invite/accept`)
      .set('Authorization', `Bearer ${signToken(ghost.id)}`)
      .send({ token });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('INVITE_EXPIRED');

    await prisma.corporateEmployee.deleteMany({ where: { userId: ghost.id } });
    await prisma.user.delete({ where: { id: ghost.id } }).catch(() => {});
  });

  test('invitee appears in employee list after accept', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    const phones = res.body.data.map((e) => e.user?.phone || e.invitedPhone);
    expect(phones).toContain(invitee.phone);
  });

  test('GET /corporate/me/company returns company for employee', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/company`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.company.id).toBe(companyA.id);
    expect(res.body.data.membership.isAdmin).toBe(false);
  });
});

// ── Isolation across companies ──────────────────────────────────────

describe('Authorization isolation', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        name: 'Company B',
        taxCode: `02${stamp}`.slice(0, 10),
        contractRef: 'HD-B-001',
      });
    companyB = res.body.data.client;
    await prisma.corporateEmployee.create({
      data: {
        corporateId: companyB.id,
        userId: corpAdminB.id,
        isAdmin: true,
        isActive: true,
        department: 'Ops',
        employeeCode: 'B-ADMIN',
        inviteUsedAt: new Date(),
      },
    });
  });

  test('corpAdminB only sees company B employees', async () => {
    const res = await request(app)
      .get(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${corpAdminBToken}`);
    expect(res.status).toBe(200);
    // Only admin B (no one else invited)
    expect(res.body.data.every((e) => e.corporateId === companyB.id || e.userId === corpAdminB.id)).toBe(
      true
    );
    // Must not include company A employee
    const userIds = res.body.data.map((e) => e.userId);
    expect(userIds).not.toContain(employeeA1.id);
    expect(userIds).not.toContain(invitee.id);
  });
});

// ── Update / delete employee ────────────────────────────────────────

describe('PUT/DELETE employees', () => {
  test('update department + employeeCode', async () => {
    const emp = await prisma.corporateEmployee.findFirst({
      where: { corporateId: companyA.id, userId: employeeA1.id },
    });
    const res = await request(app)
      .put(`${BASE}/corporate/me/company/employees/${emp.id}`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ department: 'Marketing', employeeCode: 'A-MKT-01' });
    expect(res.status).toBe(200);
    expect(res.body.data.employee.department).toBe('Marketing');
    expect(res.body.data.employee.employeeCode).toBe('A-MKT-01');
  });

  test('delete employee with IN_PROGRESS booking → 409', async () => {
    const emp = await prisma.corporateEmployee.findFirst({
      where: { corporateId: companyA.id, userId: employeeA1.id },
    });
    await prisma.corporateBooking.create({
      data: {
        corporateId: companyA.id,
        employeeId: emp.id,
        purpose: 'Active trip',
        pickupAt: new Date(Date.now() + 3 * 3600_000),
        returnAt: new Date(Date.now() + 10 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        status: 'IN_PROGRESS',
      },
    });

    const res = await request(app)
      .delete(`${BASE}/corporate/me/company/employees/${emp.id}`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMPLOYEE_HAS_ACTIVE_BOOKING');
  });

  test('delete employee after cancelling booking → 200', async () => {
    const emp = await prisma.corporateEmployee.findFirst({
      where: { corporateId: companyA.id, userId: employeeA1.id },
    });
    await prisma.corporateBooking.updateMany({
      where: { employeeId: emp.id },
      data: { status: 'CANCELLED' },
    });

    const res = await request(app)
      .delete(`${BASE}/corporate/me/company/employees/${emp.id}`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});

// ── Invite unknown phone (pending, no user) ─────────────────────────

describe('Invite unknown phone', () => {
  test('creates pending invite without userId', async () => {
    const unknownPhone = `086${stamp}`.slice(0, 10);
    const res = await request(app)
      .post(`${BASE}/corporate/me/company/employees`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({ phone: unknownPhone, department: 'HR' });
    expect(res.status).toBe(201);
    expect(res.body.data.employee.isActive).toBe(false);
    expect(res.body.data.employee.userId).toBeNull();
    expect(res.body.data.employee.invitedPhone).toBe(unknownPhone);
    expect(res.body.data.inviteToken).toBeTruthy();
  });
});
