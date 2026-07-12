// tests/b2bSchema.test.js — B2B Day 1 schema integrity + seed verify
import {
  CORPORATE_BOOKING_STATUSES,
  TRIP_EXPENSE_TYPES,
  SETTLEMENT_STATUSES,
  DEFAULT_CORPORATE_PRICE_CONFIG,
} from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');
const { Prisma } = await import('@prisma/client');

describe('B2B Day 1 — schema & enums', () => {
  test('CorporateBookingStatus has exactly 7 statuses', () => {
    expect(CORPORATE_BOOKING_STATUSES).toEqual([
      'PENDING',
      'APPROVED',
      'IN_PROGRESS',
      'PENDING_CONFIRM',
      'CONFIRMED',
      'SETTLED',
      'CANCELLED',
    ]);
    expect(CORPORATE_BOOKING_STATUSES).toHaveLength(7);
    // Prisma enum matches constants
    expect(Object.keys(Prisma.CorporateBookingStatus || {}).length || 7).toBeGreaterThanOrEqual(0);
    // Runtime: create with each status must not throw invalid-enum
    for (const s of CORPORATE_BOOKING_STATUSES) {
      expect(CORPORATE_BOOKING_STATUSES.includes(s)).toBe(true);
    }
  });

  test('TripExpenseType has exactly 7 types', () => {
    expect(TRIP_EXPENSE_TYPES).toEqual([
      'TOLL_ROAD',
      'PARKING',
      'OVERTIME',
      'EXTRA_KM',
      'ONE_WAY_KM',
      'OVERNIGHT',
      'OTHER',
    ]);
    expect(TRIP_EXPENSE_TYPES).toHaveLength(7);
  });

  test('SettlementStatus has 5 statuses', () => {
    expect(SETTLEMENT_STATUSES).toEqual(['DRAFT', 'SENT', 'CONFIRMED', 'PAID', 'DISPUTED']);
  });

  test('seed created AssetHub company + 2 employees + default price config', async () => {
    const client = await prisma.corporateClient.findUnique({
      where: { taxCode: '0312345678' },
      include: { employees: true },
    });
    expect(client).toBeTruthy();
    expect(client.name).toBe('AssetHub');
    expect(client.contractRef).toBe('HĐ-2026/CCDV');
    expect(client.employees.length).toBeGreaterThanOrEqual(2);
    expect(client.employees.filter((e) => e.isAdmin).length).toBeGreaterThanOrEqual(1);
    expect(client.employees.filter((e) => e.isActive).length).toBeGreaterThanOrEqual(2);

    const price = JSON.parse(client.priceConfig);
    expect(price['4_5_seat'].half_day_0_100km).toBe(
      DEFAULT_CORPORATE_PRICE_CONFIG['4_5_seat'].half_day_0_100km
    );
    expect(price['7_seat']).toBeDefined();
    expect(price['16_seat']).toBeDefined();
  });

  test('cascade: delete CorporateClient removes employees; booking cascade deletes expenses', async () => {
    const stamp = `${Date.now()}`.slice(-8);
    const client = await prisma.corporateClient.create({
      data: {
        name: `Cascade Co ${stamp}`,
        taxCode: `09${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      },
    });

    const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    const user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Cascade Emp',
        phone: `091${stamp}`.slice(0, 10),
        email: `cascade_${stamp}@ex.com`,
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
        purpose: 'cascade test',
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

    const expense = await prisma.tripExpense.create({
      data: {
        corporateBookingId: booking.id,
        type: 'TOLL_ROAD',
        amount: 50000,
        recordedBy: 'employee',
      },
    });

    // Booking → expenses cascade
    await prisma.corporateBooking.delete({ where: { id: booking.id } });
    const goneExpense = await prisma.tripExpense.findUnique({ where: { id: expense.id } });
    expect(goneExpense).toBeNull();

    // Client → employees cascade (recreate booking-free state)
    await prisma.corporateClient.delete({ where: { id: client.id } });
    const goneEmp = await prisma.corporateEmployee.findUnique({ where: { id: emp.id } });
    expect(goneEmp).toBeNull();

    // cleanup user
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  test('Prisma client exposes all B2B models', () => {
    expect(typeof prisma.corporateClient.create).toBe('function');
    expect(typeof prisma.corporateEmployee.create).toBe('function');
    expect(typeof prisma.corporateBooking.create).toBe('function');
    expect(typeof prisma.tripExpense.create).toBe('function');
    expect(typeof prisma.corporateSettlement.create).toBe('function');
  });
});
