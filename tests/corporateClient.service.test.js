// tests/corporateClient.service.test.js — B2B Day 2 unit tests (UC-61/62/63 helpers)
import {
  generateInviteToken,
  isInviteExpired,
  inviteExpiresAt,
} from '../src/utils/corporateInvite.js';
import {
  validateTaxCode,
  corporateClientService,
} from '../src/api/v1/corporate/corporateClient.service.js';
import { INVITE_TTL_MS } from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');

describe('corporate-client.service unit', () => {
  describe('validateTaxCode', () => {
    test('accepts 10–13 digit tax codes', () => {
      expect(validateTaxCode('0312345678')).toBe('0312345678');
      expect(validateTaxCode('0312345678001')).toBe('0312345678001');
      expect(validateTaxCode('0312345678-001')).toBe('0312345678-001');
    });

    test('rejects letters / wrong length → 422 TAX_CODE_INVALID', () => {
      try {
        validateTaxCode('ABC1234567');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe('TAX_CODE_INVALID');
      }
      try {
        validateTaxCode('12345');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.code).toBe('TAX_CODE_INVALID');
      }
    });
  });

  describe('invite token helpers', () => {
    test('generateInviteToken produces unique unpredictable tokens', () => {
      const a = generateInviteToken();
      const b = generateInviteToken();
      expect(a).toHaveLength(64);
      expect(b).toHaveLength(64);
      expect(a).not.toBe(b);
      expect(/^[0-9a-f]+$/.test(a)).toBe(true);
    });

    test('invite expiry: 48h boundary', () => {
      const now = new Date('2026-07-12T10:00:00.000Z');
      const expires = inviteExpiresAt(now);
      expect(expires.getTime() - now.getTime()).toBe(INVITE_TTL_MS);

      // 48h ago → expired
      const expiredAt = new Date(now.getTime() - INVITE_TTL_MS);
      expect(isInviteExpired(expiredAt, now)).toBe(true);

      // 47h ago → still valid
      const almost = new Date(now.getTime() - (47 * 60 * 60 * 1000));
      // almost is the issued-at; expiry would be almost+48h which is still future
      const almostExpiry = inviteExpiresAt(almost);
      expect(isInviteExpired(almostExpiry, now)).toBe(false);

      // exactly now as expiry → expired (≤)
      expect(isInviteExpired(now, now)).toBe(true);

      // missing expiry → expired
      expect(isInviteExpired(null, now)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Service-layer coverage against real MySQL — exercises the CRUD /
// self-register / price-config paths that the HTTP suites don't hit
// directly. Mirrors couponService.test.js: talk to the service, real DB.
// ─────────────────────────────────────────────────────────────────────
describe('corporateClientService — CRUD + self-register (real DB)', () => {
  const stamp = Date.now().toString().slice(-7);
  const createdClientIds = [];
  const createdUserIds = [];
  let customerRole;

  const uniqTax = (prefix) => `${prefix}${stamp}`.slice(0, 10).padEnd(10, '0');

  const trackClient = (c) => {
    if (c?.id) createdClientIds.push(c.id);
    return c;
  };

  beforeAll(async () => {
    customerRole = await prisma.role.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'c' },
    });
  });

  afterAll(async () => {
    // FK-safe teardown: bookings → employees → clients → users.
    await prisma.corporateBooking
      .deleteMany({ where: { corporateId: { in: createdClientIds } } })
      .catch(() => {});
    await prisma.corporateEmployee
      .deleteMany({ where: { corporateId: { in: createdClientIds } } })
      .catch(() => {});
    await prisma.corporateClient
      .deleteMany({ where: { id: { in: createdClientIds } } })
      .catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    await prisma.$disconnect();
  });

  test('create → serializes priceConfig to an object + rejects duplicate taxCode', async () => {
    const taxCode = uniqTax('61');
    const client = trackClient(
      await corporateClientService.create({
        name: `Svc Co ${stamp}`,
        taxCode,
        contactEmail: `svc_${stamp}@ex.com`,
        contractStart: '2026-01-01',
        contractEnd: '2027-01-01',
      })
    );
    expect(client.id).toBeGreaterThan(0);
    // priceConfig comes back parsed as an object, not a JSON string.
    expect(typeof client.priceConfig).toBe('object');
    expect(client.contractStart).toBeInstanceOf(Date);

    await expect(
      corporateClientService.create({ name: 'dup', taxCode })
    ).rejects.toMatchObject({ code: 'TAX_CODE_CONFLICT' });
  });

  test('getById returns _count + parsed priceConfig; unknown id → 404', async () => {
    const client = trackClient(
      await corporateClientService.create({ name: `Get ${stamp}`, taxCode: uniqTax('62') })
    );
    const fetched = await corporateClientService.getById(client.id);
    expect(fetched.id).toBe(client.id);
    expect(fetched._count).toHaveProperty('employees');
    expect(typeof fetched.priceConfig).toBe('object');

    await expect(corporateClientService.getById(999_999_999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('update patches fields, dates, priceConfig; taxCode change guarded against dup', async () => {
    const a = trackClient(
      await corporateClientService.create({ name: `UpdA ${stamp}`, taxCode: uniqTax('63') })
    );
    const b = trackClient(
      await corporateClientService.create({ name: `UpdB ${stamp}`, taxCode: uniqTax('64') })
    );

    const updated = await corporateClientService.update(a.id, {
      name: `UpdA renamed ${stamp}`,
      contractStart: '2026-03-01',
      contractEnd: null,
      creditLimit: 5_000_000,
      isActive: true,
      priceConfig: { note: 'negotiated' },
    });
    expect(updated.name).toBe(`UpdA renamed ${stamp}`);
    expect(updated.contractStart).toBeInstanceOf(Date);
    expect(updated.contractEnd).toBeNull();
    expect(updated.priceConfig).toMatchObject({ note: 'negotiated' });

    // Changing A's taxCode to B's must conflict.
    await expect(
      corporateClientService.update(a.id, { taxCode: b.taxCode })
    ).rejects.toMatchObject({ code: 'TAX_CODE_CONFLICT' });

    // Unknown id → 404.
    await expect(
      corporateClientService.update(999_999_999, { name: 'x' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('remove soft-deletes (isActive=false); blocks when active bookings exist', async () => {
    const client = trackClient(
      await corporateClientService.create({ name: `Rm ${stamp}`, taxCode: uniqTax('65') })
    );
    const removed = await corporateClientService.remove(client.id);
    expect(removed.isActive).toBe(false);

    // A client with an active booking cannot be removed.
    const withBooking = trackClient(
      await corporateClientService.create({ name: `RmBk ${stamp}`, taxCode: uniqTax('66') })
    );
    const emp = await prisma.corporateEmployee.create({
      data: { corporateId: withBooking.id, isAdmin: true, isActive: true },
    });
    await prisma.corporateBooking.create({
      data: {
        corporateId: withBooking.id,
        employeeId: emp.id,
        purpose: 'active',
        pickupAt: new Date(Date.now() + 3600_000),
        returnAt: new Date(Date.now() + 7200_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 1_000_000,
        rentalType: 'full_day',
        vehicleType: '7_seat',
        status: 'IN_PROGRESS',
      },
    });
    await expect(corporateClientService.remove(withBooking.id)).rejects.toMatchObject({
      code: 'CLIENT_HAS_ACTIVE_BOOKINGS',
    });
    await expect(corporateClientService.remove(999_999_999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('getPriceConfig + updatePriceConfig round-trip; rejects non-object', async () => {
    const client = trackClient(
      await corporateClientService.create({ name: `Pc ${stamp}`, taxCode: uniqTax('67') })
    );
    const cfg = await corporateClientService.getPriceConfig(client.id);
    expect(typeof cfg).toBe('object');

    const updated = await corporateClientService.updatePriceConfig(client.id, {
      full_day: { '7_seat': 1_234_000 },
    });
    expect(updated.priceConfig).toMatchObject({ full_day: { '7_seat': 1_234_000 } });

    await expect(
      corporateClientService.updatePriceConfig(client.id, null)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('list enriches rows with contractStatus + month KPIs and supports q filter', async () => {
    const client = trackClient(
      await corporateClientService.create({
        name: `ListCo ${stamp}`,
        taxCode: uniqTax('68'),
        contractEnd: '2020-01-01', // already past → EXPIRED
      })
    );
    const res = await corporateClientService.list({ q: `ListCo ${stamp}`, page: 1, size: 20 });
    const row = res.items.find((c) => c.id === client.id);
    expect(row).toBeTruthy();
    expect(row.contractStatus).toBe('EXPIRED');
    expect(row).toHaveProperty('totalTripsThisMonth');
    expect(row).toHaveProperty('pendingSettlement');
  });

  test('selfRegister creates client + admin membership; blocks second company', async () => {
    const user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Self Reg',
        phone: `097${stamp}`.slice(0, 10),
        email: `selfreg_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const { client, membership } = await corporateClientService.selfRegister(user.id, {
      name: `SelfCo ${stamp}`,
      taxCode: uniqTax('69'),
      department: 'Ops',
    });
    trackClient(client);
    expect(membership.isAdmin).toBe(true);
    expect(membership.corporateId).toBe(client.id);
    // Contact fields fall back to the user's profile.
    expect(client.contactEmail).toBe(`selfreg_${stamp}@ex.com`);
    expect(typeof client.priceConfig).toBe('object');

    // Same user registering again → already a member.
    await expect(
      corporateClientService.selfRegister(user.id, {
        name: 'second',
        taxCode: uniqTax('70'),
      })
    ).rejects.toMatchObject({ code: 'ALREADY_CORPORATE_MEMBER' });
  });
});
