// tests/corporate-dashboard.service.test.js — B2B Day 6 unit
import { corporateDashboardService } from '../src/api/v1/corporate/corporateDashboard.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: prisma } = await import('../src/config/db.js');

const stamp = `${Date.now()}`.slice(-8) + Math.floor(Math.random() * 90 + 10);

describe('corporate-dashboard.service', () => {
  let customerRole;
  let corporate;
  let emp1;
  let emp2;
  let mem1;
  let mem2;

  beforeAll(async () => {
    customerRole = await prisma.role.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Customer', description: 'c' },
    });

    corporate = await prisma.corporateClient.create({
      data: {
        name: `DashCo ${stamp}`,
        taxCode: `51${stamp}`.slice(0, 10),
        priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
        isActive: true,
      },
    });

    emp1 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Nguyen A',
        phone: `055${stamp}`.slice(0, 10),
        email: `na_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    emp2 = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName: 'Tran B',
        phone: `056${stamp}`.slice(0, 10),
        email: `tb_${stamp}@ex.com`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    mem1 = await prisma.corporateEmployee.create({
      data: {
        corporateId: corporate.id,
        userId: emp1.id,
        isAdmin: false,
        isActive: true,
      },
    });
    mem2 = await prisma.corporateEmployee.create({
      data: {
        corporateId: corporate.id,
        userId: emp2.id,
        isAdmin: false,
        isActive: true,
      },
    });

    const mk = async (opts) => {
      const b = await prisma.corporateBooking.create({
        data: {
          corporateId: corporate.id,
          employeeId: opts.employeeId,
          pickupAt: opts.pickupAt,
          returnAt: new Date(opts.pickupAt.getTime() + 6 * 3600_000),
          pickupAddress: 'A Street',
          dropoffAddress: 'B Street',
          basePrice: opts.basePrice,
          rentalType: 'half_day',
          vehicleType: '4_5_seat',
          estimatedKm: 50,
          status: opts.status,
          finalAmount: opts.finalAmount ?? null,
        },
      });
      if (opts.expenses) {
        for (const e of opts.expenses) {
          await prisma.tripExpense.create({
            data: {
              corporateBookingId: b.id,
              type: e.type,
              amount: e.amount,
              recordedBy: 'employee',
              approvedByAdmin: e.approved ?? true,
            },
          });
        }
      }
      return b;
    };

    // April 2026 (current-ish for filter): emp1 has 3 trips, emp2 has 1
    await mk({
      employeeId: mem1.id,
      pickupAt: new Date('2026-04-03T08:00:00.000Z'),
      basePrice: 600_000,
      status: 'CONFIRMED',
      finalAmount: 715_000,
      expenses: [
        { type: 'TOLL_ROAD', amount: 50_000 },
        { type: 'PARKING', amount: 20_000 },
      ],
    });
    await mk({
      employeeId: mem1.id,
      pickupAt: new Date('2026-04-10T08:00:00.000Z'),
      basePrice: 600_000,
      status: 'PENDING_CONFIRM',
      expenses: [{ type: 'OVERTIME', amount: 50_000 }],
    });
    await mk({
      employeeId: mem1.id,
      pickupAt: new Date('2026-04-12T08:00:00.000Z'),
      basePrice: 600_000,
      status: 'PENDING',
    });
    await mk({
      employeeId: mem2.id,
      pickupAt: new Date('2026-04-20T08:00:00.000Z'),
      basePrice: 700_000,
      status: 'CONFIRMED',
      finalAmount: 770_000,
      expenses: [{ type: 'EXTRA_KM', amount: 30_000 }],
    });
    // March — must not count in April
    await mk({
      employeeId: mem1.id,
      pickupAt: new Date('2026-03-15T08:00:00.000Z'),
      basePrice: 999_000,
      status: 'CONFIRMED',
      finalAmount: 999_000,
    });
  });

  afterAll(async () => {
    await prisma.tripExpense
      .deleteMany({ where: { booking: { corporateId: corporate.id } } })
      .catch(() => {});
    await prisma.corporateBooking.deleteMany({ where: { corporateId: corporate.id } }).catch(() => {});
    await prisma.corporateEmployee.deleteMany({ where: { corporateId: corporate.id } }).catch(() => {});
    await prisma.corporateClient.delete({ where: { id: corporate.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [emp1.id, emp2.id] } } }).catch(() => {});
  });

  test('currentMonth.totalTrips counts only requested month', async () => {
    const dash = await corporateDashboardService.getDashboard(corporate.id, {
      month: '2026-04',
    });
    expect(dash.currentMonth.totalTrips).toBe(4); // not the March one
    expect(dash.month).toBe('2026-04');
  });

  test('pendingConfirm + pendingApproval counts', async () => {
    const dash = await corporateDashboardService.getDashboard(corporate.id, {
      month: '2026-04',
    });
    expect(dash.currentMonth.pendingConfirm).toBe(1);
    expect(dash.currentMonth.pendingApproval).toBe(1);
  });

  test('expenseBreakdown by type (approved only)', async () => {
    const dash = await corporateDashboardService.getDashboard(corporate.id, {
      month: '2026-04',
    });
    expect(dash.expenseBreakdown.TOLL_ROAD).toBe(50_000);
    expect(dash.expenseBreakdown.PARKING).toBe(20_000);
    expect(dash.expenseBreakdown.OVERTIME).toBe(50_000);
    expect(dash.expenseBreakdown.EXTRA_KM).toBe(30_000);
  });

  test('tripsByEmployee sorted by trips desc', async () => {
    const dash = await corporateDashboardService.getDashboard(corporate.id, {
      month: '2026-04',
    });
    expect(dash.tripsByEmployee[0].name).toBe('Nguyen A');
    expect(dash.tripsByEmployee[0].trips).toBe(3);
    expect(dash.tripsByEmployee[1].name).toBe('Tran B');
    expect(dash.tripsByEmployee[1].trips).toBe(1);
  });
});
