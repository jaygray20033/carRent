// tests/contract-amendment.methods.test.js — ENT-Day 5 coverage lift for
// amendment.service.js (drives the service methods against the real DB, not
// just the pure helpers). Targets the create/sign/upload/list branches.
import { jest } from '@jest/globals';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: amendmentService } = await import(
  '../src/api/v1/corporate/amendment.service.js'
);
const { default: prisma } = await import('../src/config/db.js');

const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);

let adminRole;
let company;
let adminMembership;
let employeeMembership;

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Admin', description: 'a' },
  });
  const customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Customer', description: 'c' },
  });

  // An ACTIVE OtoRent admin so signA's notify loop has a recipient.
  await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'OT Admin AM',
      phone: `070${stamp}`.slice(0, 10),
      email: `otam_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  company = await prisma.corporateClient.create({
    data: {
      name: `AMCo ${stamp}`,
      taxCode: `71${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
      contractStart: new Date(Date.now() - 60 * 86400_000),
      contractEnd: new Date(Date.now() + 300 * 86400_000),
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Corp Admin AM',
      phone: `071${stamp}`.slice(0, 10),
      email: `caam_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: adminUser.id, isAdmin: true, isActive: true },
  });

  const empUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Corp Emp AM',
      phone: `072${stamp}`.slice(0, 10),
      email: `ceam_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeMembership = await prisma.corporateEmployee.create({
    data: { corporateId: company.id, userId: empUser.id, isAdmin: false, isActive: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('amendment.service create() validation', () => {
  test('unknown corporate → NotFoundError', async () => {
    await expect(
      amendmentService.create(999999999, { amendmentNo: 'X', title: 'T', effectiveDate: new Date() })
    ).rejects.toThrow();
  });

  test('invalid effectiveDate → INVALID_EFFECTIVE_DATE (422)', async () => {
    await expect(
      amendmentService.create(company.id, {
        amendmentNo: `PL-BAD-${stamp}`,
        title: 'T',
        effectiveDate: 'not-a-date',
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('past effectiveDate → EFFECTIVE_DATE_IN_PAST (422)', async () => {
    await expect(
      amendmentService.create(company.id, {
        amendmentNo: `PL-PAST-${stamp}`,
        title: 'T',
        effectiveDate: new Date(Date.now() - 7 * 86400_000),
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('missing amendmentNo → INVALID_AMENDMENT_NO (422)', async () => {
    await expect(
      amendmentService.create(company.id, {
        amendmentNo: '   ',
        title: 'T',
        effectiveDate: new Date(Date.now() + 86400_000),
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('duplicate amendmentNo → AMENDMENT_NO_EXISTS (409)', async () => {
    const no = `PL-DUP-${stamp}`;
    await amendmentService.create(company.id, {
      amendmentNo: no,
      title: 'First',
      content: 'c',
      effectiveDate: new Date(Date.now() + 86400_000),
    });
    await expect(
      amendmentService.create(company.id, {
        amendmentNo: no,
        title: 'Second',
        effectiveDate: new Date(Date.now() + 86400_000),
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('amendment.service sign + apply', () => {
  test('signA by non-admin membership → ForbiddenError (403)', async () => {
    const created = await amendmentService.create(company.id, {
      amendmentNo: `PL-FORB-${stamp}`,
      title: 'T',
      effectiveDate: new Date(Date.now() + 86400_000),
    });
    await expect(amendmentService.signA(employeeMembership, created.id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('both sign, effective now, no priceConfigDelta → applied without price change', async () => {
    const created = await amendmentService.create(company.id, {
      amendmentNo: `PL-NODLT-${stamp}`,
      title: 'No delta',
      content: 'c',
      effectiveDate: new Date(Date.now() - 3600_000), // already past → effective on both-sign
    });
    await amendmentService.signB(company.id, created.id);
    const signed = await amendmentService.signA(adminMembership, created.id);
    expect(signed.signedByA).toBe(true);
    expect(signed.signedByB).toBe(true);
    expect(signed.isEffective).toBe(true);
    const row = await prisma.contractAmendment.findUnique({ where: { id: created.id } });
    expect(row.appliedAt).toBeTruthy();
  });

  test('signB twice → ALREADY_SIGNED (409)', async () => {
    const created = await amendmentService.create(company.id, {
      amendmentNo: `PL-DBLB-${stamp}`,
      title: 'T',
      effectiveDate: new Date(Date.now() + 86400_000),
    });
    await amendmentService.signB(company.id, created.id);
    await expect(amendmentService.signB(company.id, created.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('both sign with priceConfigDelta effective → merged into corporate priceConfig', async () => {
    const created = await amendmentService.create(company.id, {
      amendmentNo: `PL-DELTA-${stamp}`,
      title: '29 seat',
      content: 'c',
      effectiveDate: new Date(Date.now() - 3600_000),
      priceConfigDelta: { '29_seat': { half_day_0_100km: 1_500_000 } },
    });
    await amendmentService.signB(company.id, created.id);
    await amendmentService.signA(adminMembership, created.id);
    const client = await prisma.corporateClient.findUnique({ where: { id: company.id } });
    const cfg = JSON.parse(client.priceConfig);
    expect(cfg['29_seat'].half_day_0_100km).toBe(1_500_000);
  });
});

describe('amendment.service list + upload', () => {
  test('uploadDocument without url → DOCUMENT_REQUIRED (422)', async () => {
    const created = await amendmentService.create(company.id, {
      amendmentNo: `PL-UP-${stamp}`,
      title: 'T',
      effectiveDate: new Date(Date.now() + 86400_000),
    });
    await expect(amendmentService.uploadDocument(company.id, created.id, '')).rejects.toMatchObject(
      { statusCode: 422 }
    );
    const ok = await amendmentService.uploadDocument(company.id, created.id, 'http://x/y.pdf');
    expect(ok.documentUrl).toBe('http://x/y.pdf');
  });

  test('uploadDocument on missing amendment → NotFoundError', async () => {
    await expect(
      amendmentService.uploadDocument(company.id, 999999999, 'http://x/y.pdf')
    ).rejects.toThrow();
  });

  test('listByCorporate + listMine return serialized items', async () => {
    const all = await amendmentService.listByCorporate(company.id);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]).toHaveProperty('signStatus');
    const mine = await amendmentService.listMine(adminMembership);
    expect(mine.length).toBe(all.length);
  });

  test('serialize tolerates malformed priceConfigDelta JSON', async () => {
    const row = await prisma.contractAmendment.create({
      data: {
        corporateId: company.id,
        amendmentNo: `PL-JUNK-${stamp}`,
        title: 'junk',
        content: 'c',
        effectiveDate: new Date(Date.now() + 86400_000),
        priceConfigDelta: '{not valid json',
      },
    });
    const list = await amendmentService.listByCorporate(company.id);
    const found = list.find((a) => a.id === row.id);
    expect(found.priceConfigDelta).toBeNull();
  });
});
