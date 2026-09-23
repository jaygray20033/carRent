// tests/sla.service.test.js — ENT Day 3 service-layer branch coverage (UC-78/79/80).
//
// Drives slaService directly against real MySQL: SLA CRUD, violation reporting,
// admin queue, confirm + termination-risk accrual, and the SLA report aggregation.
// Mirrors tripExpense.service.test.js: real DB, unique stamp, FK-safe teardown.
import prisma from '../src/config/db.js';
import { slaService } from '../src/api/v1/corporate/sla.service.js';

const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);

let customerRole;
let adminRole;
let company;
let otherCompany;
let adminUser; // OtoRent ADMIN — recipient of notifyOtorentAdmins
let empUser;
let adminMembership; // corporate admin
let empMembership; // corporate non-admin
let sla; // an active SLA on `company`
let supplier;

const userIds = [];
const corpIds = [];
const supplierIds = [];
const bookingIds = [];

async function makeUser(prefix, roleId, over = {}) {
  const u = await prisma.user.create({
    data: {
      roleId,
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
      pickupAt: new Date(Date.now() + 5 * 3600_000),
      returnAt: new Date(Date.now() + 12 * 3600_000),
      pickupAddress: 'A',
      dropoffAddress: 'B',
      basePrice: 1_000_000,
      rentalType: 'full_day',
      vehicleType: '7_seat',
      status: 'IN_PROGRESS',
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
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị', description: 'a' },
  });

  company = await prisma.corporateClient.create({
    data: {
      name: `SlaCo ${stamp}`,
      taxCode: `81${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  corpIds.push(company.id);

  otherCompany = await prisma.corporateClient.create({
    data: {
      name: `SlaOther ${stamp}`,
      taxCode: `82${stamp}`.slice(0, 10).padEnd(10, '0'),
      isActive: true,
    },
  });
  corpIds.push(otherCompany.id);

  adminUser = await makeUser('811', adminRole.id);
  empUser = await makeUser('812', customerRole.id);

  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });
  empMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: empUser.id, isAdmin: false, isActive: true },
  });

  sla = await slaService.createSla(company.id, {
    code: 'ontime',
    name: 'On-time pickup',
    description: 'd',
    targetValue: '95%',
    penaltyRule: 'x',
  });

  supplier = await prisma.supplier.create({
    data: {
      name: `Sup ${stamp}`,
      contactEmail: `sup_${stamp}@ex.com`,
      isActive: true,
    },
  });
  supplierIds.push(supplier.id);
});

afterAll(async () => {
  await prisma.sLAViolation
    .deleteMany({ where: { booking: { corporateId: { in: corpIds } } } })
    .catch(() => {});
  await prisma.contractSLA.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.corporateBooking.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.corporateEmployee.deleteMany({ where: { corporateId: { in: corpIds } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } }).catch(() => {});
  await prisma.corporateClient.deleteMany({ where: { id: { in: corpIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe('createSla', () => {
  test('unknown corporate → 404', async () => {
    await expect(slaService.createSla(999_999_999, { code: 'X', name: 'n' })).rejects.toMatchObject(
      { statusCode: 404 }
    );
  });

  test('blank code → INVALID_SLA_CODE', async () => {
    await expect(slaService.createSla(company.id, { code: '  ', name: 'n' })).rejects.toMatchObject(
      { code: 'INVALID_SLA_CODE' }
    );
  });

  test('duplicate code → SLA_CODE_EXISTS', async () => {
    await expect(
      slaService.createSla(company.id, { code: 'ontime', name: 'dup' })
    ).rejects.toMatchObject({ code: 'SLA_CODE_EXISTS' });
  });

  test('happy path upcases + defaults isActive true', async () => {
    const created = await slaService.createSla(company.id, {
      code: 'resp',
      name: '  Response  ',
      isActive: false,
    });
    expect(created.code).toBe('RESP');
    expect(created.isActive).toBe(false);
  });
});

describe('listSla / listMySla', () => {
  test('listSla unknown corporate → 404', async () => {
    await expect(slaService.listSla(999_999_999)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('listSla returns catalog', async () => {
    const items = await slaService.listSla(company.id);
    expect(items.some((s) => s.code === 'ONTIME')).toBe(true);
  });

  test('listMySla returns items + risk flags', async () => {
    const res = await slaService.listMySla(adminMembership);
    expect(Array.isArray(res.items)).toBe(true);
    expect(res).toHaveProperty('contractTerminationRisk');
    expect(res).toHaveProperty('warningFlag');
    expect(res).toHaveProperty('criticalCount');
  });
});

describe('updateSla', () => {
  test('unknown sla → 404', async () => {
    await expect(
      slaService.updateSla(company.id, 999_999_999, { name: 'x' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('patches all provided fields', async () => {
    const res = await slaService.updateSla(company.id, sla.id, {
      name: '  New name  ',
      description: '',
      targetValue: '',
      penaltyRule: '',
      isActive: false,
    });
    expect(res.name).toBe('New name');
    expect(res.description).toBeNull();
    expect(res.targetValue).toBeNull();
    expect(res.penaltyRule).toBeNull();
    expect(res.isActive).toBe(false);
    // restore active so later reportViolation tests find an active SLA
    await slaService.updateSla(company.id, sla.id, { isActive: true });
  });

  test('empty patch leaves row unchanged', async () => {
    const res = await slaService.updateSla(company.id, sla.id, {});
    expect(res.id).toBe(sla.id);
  });
});

describe('reportViolation guards', () => {
  test('unknown booking → 404', async () => {
    await expect(
      slaService.reportViolation(empMembership, 999_999_999, { slaId: sla.id, description: 'd' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('booking of another company → 403', async () => {
    const foreignEmp = await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, isAdmin: false, isActive: true },
    });
    const foreign = await makeBooking({ corporateId: otherCompany.id, employeeId: foreignEmp.id });
    await expect(
      slaService.reportViolation(empMembership, foreign.id, { slaId: sla.id, description: 'd' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("non-admin on another employee's booking → 403", async () => {
    const b = await makeBooking({ employeeId: adminMembership.id });
    await expect(
      slaService.reportViolation(empMembership, b.id, { slaId: sla.id, description: 'd' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('non-reportable status → BOOKING_NOT_REPORTABLE', async () => {
    const b = await makeBooking({ status: 'PENDING' });
    await expect(
      slaService.reportViolation(empMembership, b.id, { slaId: sla.id, description: 'd' })
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_REPORTABLE' });
  });

  test('SLA not belonging to company → 403', async () => {
    const b = await makeBooking();
    await expect(
      slaService.reportViolation(empMembership, b.id, { slaId: 999_999_999, description: 'd' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('invalid severity → INVALID_SEVERITY', async () => {
    const b = await makeBooking();
    await expect(
      slaService.reportViolation(empMembership, b.id, {
        slaId: sla.id,
        severity: 'HUGE',
        description: 'd',
      })
    ).rejects.toMatchObject({ code: 'INVALID_SEVERITY' });
  });

  test('blank description → INVALID_DESCRIPTION', async () => {
    const b = await makeBooking();
    await expect(
      slaService.reportViolation(empMembership, b.id, { slaId: sla.id, description: '   ' })
    ).rejects.toMatchObject({ code: 'INVALID_DESCRIPTION' });
  });
});

describe('reportViolation happy paths', () => {
  test('array evidenceUrls → stored as JSON, returned as array', async () => {
    const b = await makeBooking();
    const v = await slaService.reportViolation(empMembership, b.id, {
      slaId: sla.id,
      severity: 'major',
      description: 'Trễ 30 phút',
      evidenceUrls: ['http://x/1.jpg', 'http://x/2.jpg'],
    });
    expect(v.severity).toBe('MAJOR');
    expect(v.reportedBy).toBe('employee');
    expect(v.evidenceUrls).toEqual(['http://x/1.jpg', 'http://x/2.jpg']);
  });

  test('raw (non-JSON) string evidenceUrls + admin reporter → wrapped, round-trips as array', async () => {
    const b = await makeBooking();
    // A single raw URL string must be normalised to a JSON array on write so the
    // read path returns it cleanly instead of throwing on JSON.parse.
    const v = await slaService.reportViolation(adminMembership, b.id, {
      slaId: sla.id,
      description: 'Nhẹ',
      evidenceUrls: 'http://x/only.jpg',
    });
    expect(v.severity).toBe('MINOR');
    expect(v.reportedBy).toBe('corporate_admin');
    expect(v.evidenceUrls).toEqual(['http://x/only.jpg']);
  });

  test('pre-encoded JSON-array string is not double-wrapped', async () => {
    const b = await makeBooking();
    const v = await slaService.reportViolation(adminMembership, b.id, {
      slaId: sla.id,
      description: 'Nhẹ',
      evidenceUrls: JSON.stringify(['http://x/a.jpg', 'http://x/b.jpg']),
    });
    expect(v.evidenceUrls).toEqual(['http://x/a.jpg', 'http://x/b.jpg']);
  });
});

describe('listBookingViolations', () => {
  test('unknown booking → 404', async () => {
    await expect(
      slaService.listBookingViolations(empMembership, 999_999_999)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('booking of another company → 403', async () => {
    const foreignEmp = await prisma.corporateEmployee.create({
      data: { corporateId: otherCompany.id, isAdmin: false, isActive: true },
    });
    const foreign = await makeBooking({ corporateId: otherCompany.id, employeeId: foreignEmp.id });
    await expect(
      slaService.listBookingViolations(empMembership, foreign.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("non-admin on another employee's booking → 403", async () => {
    const b = await makeBooking({ employeeId: adminMembership.id });
    await expect(
      slaService.listBookingViolations(empMembership, b.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('lists violations, parses evidence array', async () => {
    const b = await makeBooking();
    await slaService.reportViolation(empMembership, b.id, {
      slaId: sla.id,
      description: 'x',
      evidenceUrls: ['http://e/1.jpg'],
    });
    const items = await slaService.listBookingViolations(adminMembership, b.id);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(items[0].evidenceUrls)).toBe(true);
  });
});

describe('adminListViolations', () => {
  test('default (no filters) returns paginated shape', async () => {
    const res = await slaService.adminListViolations();
    expect(res).toHaveProperty('items');
    expect(res).toHaveProperty('total');
    expect(res.page).toBe(1);
    expect(res.size).toBeGreaterThan(0);
    expect(res.items.every((v) => Array.isArray(v.evidenceUrls))).toBe(true);
  });

  test('filters by isConfirmed=false, severity, corporateId + custom page/size', async () => {
    const res = await slaService.adminListViolations({
      isConfirmed: false,
      severity: 'MAJOR',
      corporateId: company.id,
      page: 1,
      size: 5,
    });
    expect(res.size).toBe(5);
    expect(res.items.every((v) => v.isConfirmed === false)).toBe(true);
    expect(res.items.every((v) => v.severity === 'MAJOR')).toBe(true);
  });

  test('size is clamped to 100 max', async () => {
    const res = await slaService.adminListViolations({ size: 9999 });
    expect(res.size).toBe(100);
  });

  // Regression: a row whose evidenceUrls is a raw (non-JSON) string must not
  // throw and 500 the whole admin queue — parseEvidenceUrls degrades gracefully.
  test('malformed evidenceUrls row does not poison the listing', async () => {
    const b = await makeBooking();
    await prisma.sLAViolation.create({
      data: {
        corporateBookingId: b.id,
        slaId: sla.id,
        reportedBy: 'employee',
        reportedById: empMembership.id,
        description: 'legacy raw url row',
        severity: 'MINOR',
        evidenceUrls: 'http://legacy/raw.jpg', // not JSON — legacy/direct-insert shape
      },
    });
    const res = await slaService.adminListViolations({ corporateId: company.id, size: 100 });
    const row = res.items.find((v) => v.description === 'legacy raw url row');
    expect(row).toBeTruthy();
    expect(row.evidenceUrls).toEqual(['http://legacy/raw.jpg']);
  });
});

describe('confirmViolation', () => {
  test('unknown violation → 404', async () => {
    await expect(slaService.confirmViolation(999_999_999, {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('MINOR confirm sets isConfirmed + resolution', async () => {
    const b = await makeBooking();
    const v = await slaService.reportViolation(empMembership, b.id, {
      slaId: sla.id,
      severity: 'MINOR',
      description: 'nhẹ',
    });
    const res = await slaService.confirmViolation(v.id, { resolution: 'Đã nhắc nhở' });
    expect(res.violation.isConfirmed).toBe(true);
    expect(res.violation.resolution).toBe('Đã nhắc nhở');
    expect(res.supplierRisk).toBeNull();
  });

  test('already confirmed → ALREADY_CONFIRMED', async () => {
    const b = await makeBooking();
    const v = await slaService.reportViolation(empMembership, b.id, {
      slaId: sla.id,
      severity: 'MINOR',
      description: 'nhẹ2',
    });
    await slaService.confirmViolation(v.id, {});
    await expect(slaService.confirmViolation(v.id, {})).rejects.toMatchObject({
      code: 'ALREADY_CONFIRMED',
    });
  });

  test('CRITICAL confirm on supplier booking accrues supplier risk + alerts', async () => {
    // Two CRITICAL confirms on supplier-fulfilled bookings → terminationRisk true.
    for (let i = 0; i < 2; i += 1) {
      const b = await makeBooking({ supplierId: supplier.id });
      const v = await slaService.reportViolation(adminMembership, b.id, {
        slaId: sla.id,
        severity: 'CRITICAL',
        description: `nặng ${i}`,
      });
      const res = await slaService.confirmViolation(v.id, { resolution: 'r' });
      expect(res.violation.severity).toBe('CRITICAL');
      expect(res.supplierRisk).toMatchObject({ supplierId: supplier.id });
    }
    const refreshed = await prisma.supplier.findUnique({ where: { id: supplier.id } });
    expect(refreshed.criticalViolationCount).toBeGreaterThanOrEqual(2);
    expect(refreshed.terminationRisk).toBe(true);
  });
});

describe('getSlaReport', () => {
  test('unknown corporate → 404', async () => {
    await expect(slaService.getSlaReport(999_999_999)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('aggregates confirmed violations by type + severity', async () => {
    const report = await slaService.getSlaReport(company.id);
    expect(report.totalTrips).toBeGreaterThanOrEqual(1);
    expect(report.totalViolations).toBeGreaterThanOrEqual(1);
    expect(report.criticalCount).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(report.byType)).toBe(true);
    // ≥2 CRITICAL → termination risk true
    expect(report.contractTerminationRisk).toBe(true);
  });

  test('expired contract → zeroed current-window report', async () => {
    const expiredCo = await prisma.corporateClient.create({
      data: {
        name: `Expired ${stamp}`,
        taxCode: `83${stamp}`.slice(0, 10).padEnd(10, '0'),
        isActive: true,
        contractStart: new Date('2020-01-01'),
        contractEnd: new Date('2020-12-31'),
      },
    });
    corpIds.push(expiredCo.id);
    const report = await slaService.getSlaReport(expiredCo.id);
    expect(report.totalViolations).toBe(0);
    expect(report.criticalCount).toBe(0);
    expect(report.contractTerminationRisk).toBe(false);
  });
});
