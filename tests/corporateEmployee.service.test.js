// tests/corporateEmployee.service.test.js — B2B Day 2 service-layer branch coverage.
//
// Exercises corporateEmployeeService directly against real MySQL to cover the
// invite / accept / update / remove branches the HTTP suites miss. Mirrors
// tripExpense.service.test.js: real DB, unique stamp, FK-safe teardown.
import prisma from '../src/config/db.js';
import { corporateEmployeeService } from '../src/api/v1/corporate/corporateEmployee.service.js';
import { generateInviteToken } from '../src/utils/corporateInvite.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);

let customerRole;
let company; // active, priceConfig JSON string
let inactiveCompany; // isActive false
let otherCompany; // for "already in another company"
let adminUser;
let adminMembership;
let empUser;
let empMembership;

const userIds = [];
const corpIds = [];

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

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'c' },
  });

  company = await prisma.corporateClient.create({
    data: {
      name: `EmpCo ${stamp}`,
      taxCode: `71${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
    },
  });
  corpIds.push(company.id);

  inactiveCompany = await prisma.corporateClient.create({
    data: {
      name: `InactiveCo ${stamp}`,
      taxCode: `72${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: false,
    },
  });
  corpIds.push(inactiveCompany.id);

  otherCompany = await prisma.corporateClient.create({
    data: {
      name: `OtherCo ${stamp}`,
      taxCode: `73${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  corpIds.push(otherCompany.id);

  adminUser = await makeUser('791');
  empUser = await makeUser('792');

  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });
  empMembership = await prisma.corporateEmployee.create({
    data: {
      corporateId: company.id,
      userId: empUser.id,
      isAdmin: false,
      isActive: true,
      employeeCode: 'EMP-01',
      department: 'Sales',
    },
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

describe('findActiveMembership / getMyCompany', () => {
  test('findActiveMembership returns membership for active user', async () => {
    const m = await corporateEmployeeService.findActiveMembership(empUser.id);
    expect(m).toBeTruthy();
    expect(m.corporateId).toBe(company.id);
  });

  test('findActiveMembership returns null for user with no membership', async () => {
    const stranger = await makeUser('793');
    const m = await corporateEmployeeService.findActiveMembership(stranger.id);
    expect(m).toBeNull();
  });

  test('getMyCompany with no membership → 403', async () => {
    const stranger = await makeUser('794');
    await expect(corporateEmployeeService.getMyCompany(stranger.id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('getMyCompany happy path parses priceConfig JSON string', async () => {
    const res = await corporateEmployeeService.getMyCompany(empUser.id);
    expect(res.company.id).toBe(company.id);
    // priceConfig was stored as a JSON string; serializeEmployee should parse it.
    expect(res.company.priceConfig['4_5_seat']).toBeDefined();
    expect(res.membership.isAdmin).toBe(false);
  });
});

describe('listEmployees', () => {
  test('lists all, strips inviteToken', async () => {
    const { items, total } = await corporateEmployeeService.listEmployees(company.id);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(items.every((e) => e.inviteToken === undefined)).toBe(true);
  });

  test('filters by isActive=true', async () => {
    const { items } = await corporateEmployeeService.listEmployees(company.id, { isActive: true });
    expect(items.every((e) => e.isActive === true)).toBe(true);
  });

  test('filters by isActive=false', async () => {
    const { items } = await corporateEmployeeService.listEmployees(company.id, { isActive: false });
    expect(items.every((e) => e.isActive === false)).toBe(true);
  });

  test('search term builds OR block', async () => {
    const { items } = await corporateEmployeeService.listEmployees(company.id, { q: 'EMP-01' });
    expect(items.some((e) => e.employeeCode === 'EMP-01')).toBe(true);
  });

  test('blank q is ignored', async () => {
    const { total } = await corporateEmployeeService.listEmployees(company.id, { q: '   ' });
    expect(total).toBeGreaterThanOrEqual(2);
  });
});

describe('invite', () => {
  test('no phone/email → INVITE_TARGET_REQUIRED', async () => {
    await expect(corporateEmployeeService.invite(company.id, {}, adminUser.id)).rejects.toMatchObject(
      { code: 'INVITE_TARGET_REQUIRED' }
    );
  });

  test('unknown corporate → 404', async () => {
    await expect(
      corporateEmployeeService.invite(999_999_999, { phone: `795${stamp}`.slice(0, 10) }, adminUser.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('inactive corporate → CLIENT_INACTIVE', async () => {
    await expect(
      corporateEmployeeService.invite(inactiveCompany.id, { phone: `796${stamp}`.slice(0, 10) }, adminUser.id)
    ).rejects.toMatchObject({ code: 'CLIENT_INACTIVE' });
  });

  test('existing user already member of this company → ALREADY_MEMBER', async () => {
    await expect(
      corporateEmployeeService.invite(company.id, { phone: empUser.phone }, adminUser.id)
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  test('existing user in another company → ALREADY_MEMBER_OTHER_COMPANY', async () => {
    const otherUser = await makeUser('797');
    await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, userId: otherUser.id, isAdmin: false, isActive: true },
    });
    await expect(
      corporateEmployeeService.invite(company.id, { phone: otherUser.phone }, adminUser.id)
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER_OTHER_COMPANY' });
  });

  test('brand-new pending invite by unknown phone', async () => {
    const phone = `798${stamp}`.slice(0, 10);
    const res = await corporateEmployeeService.invite(
      company.id,
      { phone, department: 'HR', employeeCode: 'NEW-1' },
      adminUser.id
    );
    expect(res.employee.userId).toBeNull();
    expect(res.employee.isActive).toBe(false);
    expect(res.employee.invitedPhone).toBe(phone);
    expect(res.inviteToken).toBeTruthy();
    expect(res.employee.inviteToken).toBeUndefined();
  });

  test('re-invite same pending phone re-issues token', async () => {
    const phone = `799${stamp}`.slice(0, 10);
    const first = await corporateEmployeeService.invite(company.id, { phone }, adminUser.id);
    const second = await corporateEmployeeService.invite(
      company.id,
      { phone, department: 'Ops' },
      adminUser.id
    );
    expect(second.inviteToken).not.toBe(first.inviteToken);
    // Same pending row reused (re-issue path), so employee id matches.
    expect(second.employee.id).toBe(first.employee.id);
    expect(second.employee.department).toBe('Ops');
  });

  test('invite by unknown email only', async () => {
    const email = `inv_${stamp}@newco.com`;
    const res = await corporateEmployeeService.invite(company.id, { email }, adminUser.id);
    expect(res.employee.invitedEmail).toBe(email);
    expect(res.inviteToken).toBeTruthy();
  });

  test('invite existing user by email links userId', async () => {
    const target = await makeUser('770');
    const res = await corporateEmployeeService.invite(company.id, { email: target.email }, adminUser.id);
    expect(res.employee.userId).toBe(target.id);
  });
});

describe('acceptInvite', () => {
  test('missing token → INVITE_TOKEN_REQUIRED', async () => {
    await expect(corporateEmployeeService.acceptInvite({}, empUser.id)).rejects.toMatchObject({
      code: 'INVITE_TOKEN_REQUIRED',
    });
  });

  test('unknown token → 404', async () => {
    await expect(
      corporateEmployeeService.acceptInvite({ token: 'nope-' + stamp }, empUser.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('already used/active → INVITE_ALREADY_USED', async () => {
    const token = generateInviteToken();
    const user = await makeUser('771');
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        userId: user.id,
        isActive: true,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await expect(
      corporateEmployeeService.acceptInvite({ token }, user.id)
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
  });

  test('expired token → INVITE_EXPIRED (410)', async () => {
    const token = generateInviteToken();
    const user = await makeUser('772');
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        userId: user.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() - 60_000),
        invitedPhone: user.phone,
      },
    });
    await expect(
      corporateEmployeeService.acceptInvite({ token }, user.id)
    ).rejects.toMatchObject({ statusCode: 410, code: 'INVITE_EXPIRED' });
  });

  test('invite bound to a different user → 403', async () => {
    const token = generateInviteToken();
    const bound = await makeUser('773');
    const other = await makeUser('774');
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        userId: bound.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await expect(
      corporateEmployeeService.acceptInvite({ token }, other.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('user already in another active company → ALREADY_MEMBER_OTHER_COMPANY', async () => {
    // user is active in otherCompany, then tries to accept an invite (unbound token) elsewhere.
    const busy = await makeUser('775');
    await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, userId: busy.id, isActive: true },
    });
    const token = generateInviteToken();
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 86400_000),
        invitedPhone: `776${stamp}`.slice(0, 10),
      },
    });
    await expect(
      corporateEmployeeService.acceptInvite({ token }, busy.id)
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER_OTHER_COMPANY' });
  });

  test('user bound to an INACTIVE row elsewhere → clean 409, not a P2002 500', async () => {
    // userId is globally unique. A dangling INACTIVE bound row (e.g. invited by
    // email to company A but never accepted) must still block accepting a second,
    // unbound invite — otherwise the update() below hits the unique constraint and
    // 500s instead of returning ALREADY_MEMBER_OTHER_COMPANY.
    const busy = await makeUser('780');
    await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, userId: busy.id, isActive: false },
    });
    const token = generateInviteToken();
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 86400_000),
        invitedPhone: `781${stamp}`.slice(0, 10),
      },
    });
    await expect(
      corporateEmployeeService.acceptInvite({ token }, busy.id)
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER_OTHER_COMPANY' });
  });

  test('happy accept → isActive true + notify', async () => {
    const token = generateInviteToken();
    const joiner = await makeUser('777');
    await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        isActive: false,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 86400_000),
        invitedPhone: joiner.phone,
      },
    });
    const res = await corporateEmployeeService.acceptInvite({ token }, joiner.id);
    expect(res.isActive).toBe(true);
    expect(res.userId).toBe(joiner.id);
  });
});

describe('resendInvite', () => {
  test('unknown employee → 404', async () => {
    await expect(
      corporateEmployeeService.resendInvite(company.id, 999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('active member → INVITE_ALREADY_USED', async () => {
    await expect(
      corporateEmployeeService.resendInvite(company.id, empMembership.id)
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
  });

  test('pending invite → re-issues token + keeps row', async () => {
    const phone = `782${stamp}`.slice(0, 10);
    const first = await corporateEmployeeService.invite(company.id, { phone }, adminUser.id);
    const res = await corporateEmployeeService.resendInvite(company.id, first.employee.id);
    expect(res.employee.id).toBe(first.employee.id);
    expect(res.inviteToken).toBeTruthy();
    expect(res.inviteToken).not.toBe(first.inviteToken);
    expect(res.employee.inviteToken).toBeUndefined();
  });

  test('consumed invite (inviteUsedAt) → INVITE_ALREADY_USED', async () => {
    const user = await makeUser('783');
    const target = await prisma.corporateEmployee.create({
      data: {
        corporateId: company.id,
        isActive: false,
        inviteUsedAt: new Date(),
        invitedPhone: `784${stamp}`.slice(0, 10),
      },
    });
    await expect(
      corporateEmployeeService.resendInvite(company.id, target.id)
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });
});

describe('updateEmployee', () => {
  test('unknown employee → 404', async () => {
    await expect(
      corporateEmployeeService.updateEmployee(company.id, 999_999_999, { department: 'X' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('patches all provided fields', async () => {
    const target = await prisma.corporateEmployee.create({
      data: { corporateId: company.id, isActive: false, invitedPhone: `778${stamp}`.slice(0, 10) },
    });
    const res = await corporateEmployeeService.updateEmployee(company.id, target.id, {
      department: 'Legal',
      employeeCode: 'LG-1',
      isAdmin: true,
      isActive: true,
    });
    expect(res.department).toBe('Legal');
    expect(res.employeeCode).toBe('LG-1');
    expect(res.isAdmin).toBe(true);
    expect(res.isActive).toBe(true);
  });

  test('empty patch leaves row unchanged', async () => {
    const target = await prisma.corporateEmployee.create({
      data: { corporateId: company.id, isActive: false, department: 'Keep', invitedPhone: `779${stamp}`.slice(0, 10) },
    });
    const res = await corporateEmployeeService.updateEmployee(company.id, target.id, {});
    expect(res.department).toBe('Keep');
  });
});

describe('removeEmployee', () => {
  test('unknown employee → 404', async () => {
    await expect(
      corporateEmployeeService.removeEmployee(company.id, 999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('employee with active booking → EMPLOYEE_HAS_ACTIVE_BOOKING', async () => {
    const target = await prisma.corporateEmployee.create({
      data: { corporateId: company.id, isActive: true, invitedPhone: `760${stamp}`.slice(0, 10) },
    });
    await prisma.corporateBooking.create({
      data: {
        corporateId: company.id,
        employeeId: target.id,
        pickupAt: new Date(Date.now() + 5 * 3600_000),
        returnAt: new Date(Date.now() + 12 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600_000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        status: 'IN_PROGRESS',
      },
    });
    await expect(
      corporateEmployeeService.removeEmployee(company.id, target.id)
    ).rejects.toMatchObject({ code: 'EMPLOYEE_HAS_ACTIVE_BOOKING' });
  });

  test('soft-remove clears userId → deleted:true', async () => {
    const user = await makeUser('761');
    const target = await prisma.corporateEmployee.create({
      data: { corporateId: company.id, userId: user.id, isActive: true },
    });
    const res = await corporateEmployeeService.removeEmployee(company.id, target.id);
    expect(res).toMatchObject({ id: target.id, deleted: true });
    const row = await prisma.corporateEmployee.findUnique({ where: { id: target.id } });
    expect(row.userId).toBeNull();
    expect(row.isActive).toBe(false);
  });
});
