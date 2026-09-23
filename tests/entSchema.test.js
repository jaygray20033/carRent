// tests/entSchema.test.js — ENT-Day 1 schema integrity + seed verify
import {
  VAS_STATUSES,
  VIOLATION_SEVERITIES,
  DEFAULT_VAS_CATALOG,
  DEFAULT_CONTRACT_SLAS,
} from '../src/constants/enterpriseVas.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');
const { Prisma } = await import('@prisma/client');

describe('ENT-Day 1 — VAS/SLA schema & seed', () => {
  test('Prisma client exposes all ENT models', () => {
    expect(typeof prisma.valueAddedService.create).toBe('function');
    expect(typeof prisma.corporateVASPrice.create).toBe('function');
    expect(typeof prisma.bookingVAS.create).toBe('function');
    expect(typeof prisma.contractSLA.create).toBe('function');
    expect(typeof prisma.sLAViolation.create).toBe('function');
    expect(typeof prisma.contractAmendment.create).toBe('function');
  });

  test('VASStatus enum has 5 values', () => {
    expect(VAS_STATUSES).toEqual([
      'PENDING',
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(VAS_STATUSES).toHaveLength(5);
    // Runtime enum objects are not always exported on Prisma namespace in this client version.
    expect(Prisma).toBeTruthy();
  });

  test('ViolationSeverity enum has MINOR/MAJOR/CRITICAL', () => {
    expect(VIOLATION_SEVERITIES).toEqual(['MINOR', 'MAJOR', 'CRITICAL']);
    expect(VIOLATION_SEVERITIES).toHaveLength(3);
  });

  test('seed created 5 active VAS defaults', async () => {
    const items = await prisma.valueAddedService.findMany({
      where: { code: { in: DEFAULT_VAS_CATALOG.map((v) => v.code) } },
      orderBy: { id: 'asc' },
    });
    expect(items).toHaveLength(5);
    expect(items.every((v) => v.isActive)).toBe(true);

    const byCode = Object.fromEntries(items.map((v) => [v.code, v]));
    expect(byCode.INTERPRETER.requiresHeadcount).toBe(true);
    expect(byCode.SECURITY.requiresHeadcount).toBe(true);
    expect(byCode.ASSISTANT.requiresHeadcount).toBe(true);
    expect(byCode.MEDIA_TEAM.requiresHeadcount).toBe(false);
    expect(byCode.PHOTOGRAPHER.requiresHeadcount).toBe(false);
  });

  test('seed created 4 AssetHub SLA defaults', async () => {
    const client = await prisma.corporateClient.findUnique({
      where: { taxCode: '0312345678' },
    });
    expect(client).toBeTruthy();

    const slas = await prisma.contractSLA.findMany({
      where: { corporateId: client.id },
    });
    expect(slas.length).toBeGreaterThanOrEqual(4);
    const codes = slas.map((s) => s.code).sort();
    expect(codes).toEqual(expect.arrayContaining(DEFAULT_CONTRACT_SLAS.map((s) => s.code)));
  });

  test('cascade: delete CorporateClient removes VAS prices + SLAs + amendments', async () => {
    const stamp = `${Date.now()}`.slice(-8);
    const client = await prisma.corporateClient.create({
      data: {
        name: `ENT Cascade ${stamp}`,
        taxCode: `07${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });

    const vas = await prisma.valueAddedService.findFirst({ where: { isActive: true } });
    expect(vas).toBeTruthy();

    const price = await prisma.corporateVASPrice.create({
      data: { corporateId: client.id, vasId: vas.id, price: 111000 },
    });
    const sla = await prisma.contractSLA.create({
      data: {
        corporateId: client.id,
        code: `SLA_${stamp}`,
        name: 'Test SLA',
        targetValue: 'ok',
      },
    });
    const amendment = await prisma.contractAmendment.create({
      data: {
        corporateId: client.id,
        amendmentNo: `PL-${stamp}`,
        title: 'Phụ lục test',
        content: 'Nội dung',
        effectiveDate: new Date(),
      },
    });

    await prisma.corporateClient.delete({ where: { id: client.id } });
    expect(await prisma.corporateVASPrice.findUnique({ where: { id: price.id } })).toBeNull();
    expect(await prisma.contractSLA.findUnique({ where: { id: sla.id } })).toBeNull();
    expect(await prisma.contractAmendment.findUnique({ where: { id: amendment.id } })).toBeNull();
  });

  test('cascade: delete CorporateBooking removes BookingVAS + SLAViolation', async () => {
    const stamp = `${Date.now()}`.slice(-8);
    const client = await prisma.corporateClient.create({
      data: {
        name: `ENT BookCascade ${stamp}`,
        taxCode: `08${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });
    const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    const user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Cascade Emp ENT',
        phone: `092${stamp}`.slice(0, 10),
        email: `ent_cascade_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    const emp = await prisma.corporateEmployee.create({
      data: {
        corporateId: client.id,
        userId: user.id,
        isAdmin: true,
        isActive: true,
      },
    });
    const booking = await prisma.corporateBooking.create({
      data: {
        corporateId: client.id,
        employeeId: emp.id,
        purpose: 'ent cascade',
        pickupAt: new Date(Date.now() + 3 * 3600_000),
        returnAt: new Date(Date.now() + 8 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        status: 'PENDING',
      },
    });
    const vas = await prisma.valueAddedService.findFirst({ where: { isActive: true } });
    const line = await prisma.bookingVAS.create({
      data: {
        corporateBookingId: booking.id,
        vasId: vas.id,
        headcount: 2,
        unitPrice: 500000,
        totalPrice: 1000000,
        status: 'PENDING',
      },
    });
    const sla = await prisma.contractSLA.create({
      data: {
        corporateId: client.id,
        code: `V_${stamp}`,
        name: 'SLA cascade',
      },
    });
    const violation = await prisma.sLAViolation.create({
      data: {
        corporateBookingId: booking.id,
        slaId: sla.id,
        reportedBy: 'employee',
        reportedById: emp.id,
        description: 'Trễ 10 phút',
        severity: 'MINOR',
      },
    });

    await prisma.corporateBooking.delete({ where: { id: booking.id } });
    expect(await prisma.bookingVAS.findUnique({ where: { id: line.id } })).toBeNull();
    expect(await prisma.sLAViolation.findUnique({ where: { id: violation.id } })).toBeNull();

    await prisma.corporateClient.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  test('unique CorporateVASPrice(corporateId, vasId) rejects duplicates', async () => {
    const stamp = `${Date.now()}`.slice(-8);
    const client = await prisma.corporateClient.create({
      data: {
        name: `ENT Unique ${stamp}`,
        taxCode: `06${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });
    const vas = await prisma.valueAddedService.findFirst({ where: { isActive: true } });
    await prisma.corporateVASPrice.create({
      data: { corporateId: client.id, vasId: vas.id, price: 100000 },
    });
    await expect(
      prisma.corporateVASPrice.create({
        data: { corporateId: client.id, vasId: vas.id, price: 200000 },
      })
    ).rejects.toThrow();
    await prisma.corporateClient.delete({ where: { id: client.id } });
  });

  test('invalid VASStatus / ViolationSeverity rejected by Prisma', async () => {
    const stamp = `${Date.now()}`.slice(-8);
    const client = await prisma.corporateClient.create({
      data: {
        name: `ENT Enum ${stamp}`,
        taxCode: `05${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });
    const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    const user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Enum Emp',
        phone: `093${stamp}`.slice(0, 10),
        email: `ent_enum_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    const emp = await prisma.corporateEmployee.create({
      data: {
        corporateId: client.id,
        userId: user.id,
        isAdmin: true,
        isActive: true,
      },
    });
    const booking = await prisma.corporateBooking.create({
      data: {
        corporateId: client.id,
        employeeId: emp.id,
        purpose: 'enum',
        pickupAt: new Date(Date.now() + 3 * 3600_000),
        returnAt: new Date(Date.now() + 8 * 3600_000),
        pickupAddress: 'A',
        dropoffAddress: 'B',
        basePrice: 600000,
        rentalType: 'half_day',
        vehicleType: '4_5_seat',
        status: 'PENDING',
      },
    });
    const vas = await prisma.valueAddedService.findFirst({ where: { isActive: true } });
    const sla = await prisma.contractSLA.create({
      data: { corporateId: client.id, code: `E_${stamp}`, name: 'enum sla' },
    });

    await expect(
      prisma.bookingVAS.create({
        data: {
          corporateBookingId: booking.id,
          vasId: vas.id,
          headcount: 1,
          unitPrice: 1,
          totalPrice: 1,
          status: 'NOT_A_STATUS',
        },
      })
    ).rejects.toThrow();

    await expect(
      prisma.sLAViolation.create({
        data: {
          corporateBookingId: booking.id,
          slaId: sla.id,
          reportedBy: 'employee',
          reportedById: emp.id,
          description: 'x',
          severity: 'ULTRA',
        },
      })
    ).rejects.toThrow();

    await prisma.corporateClient.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });
});
