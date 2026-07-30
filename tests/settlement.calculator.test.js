// tests/settlement.calculator.test.js — B2B Day 5 unit
import {
  filterBookingsForPeriod,
  calculateSettlementTotals,
} from '../src/services/settlementCalculator.js';

describe('settlement.calculator', () => {
  const periodStart = new Date('2026-04-01T00:00:00.000Z');
  const periodEnd = new Date('2026-04-30T23:59:59.999Z');

  const mk = (overrides) => ({
    id: 1,
    status: 'CONFIRMED',
    basePrice: 1_000_000,
    completedAt: new Date('2026-04-15T10:00:00.000Z'),
    pickupAt: new Date('2026-04-15T08:00:00.000Z'),
    expenses: [],
    ...overrides,
  });

  test('only CONFIRMED bookings are included — skip CANCELLED/PENDING/IN_PROGRESS', () => {
    const bookings = [
      mk({ id: 1, status: 'CONFIRMED' }),
      mk({ id: 2, status: 'CANCELLED' }),
      mk({ id: 3, status: 'PENDING' }),
      mk({ id: 4, status: 'IN_PROGRESS' }),
      mk({ id: 5, status: 'CONFIRMED', basePrice: 500_000 }),
    ];
    const filtered = filterBookingsForPeriod(bookings, periodStart, periodEnd);
    expect(filtered.map((b) => b.id)).toEqual([1, 5]);
  });

  test('bookings outside period are excluded', () => {
    const bookings = [
      mk({ id: 1, completedAt: new Date('2026-04-10T00:00:00.000Z') }),
      mk({ id: 2, completedAt: new Date('2026-03-31T00:00:00.000Z') }), // before
      mk({ id: 3, completedAt: new Date('2026-05-01T00:00:00.000Z') }), // after
    ];
    const filtered = filterBookingsForPeriod(bookings, periodStart, periodEnd);
    expect(filtered.map((b) => b.id)).toEqual([1]);
  });

  test('VAT 10%: base 2M + expenses 400k → VAT 240k → total 2.64M', () => {
    const bookings = [
      mk({
        basePrice: 2_000_000,
        expenses: [
          { type: 'TOLL_ROAD', amount: 300_000, approvedByAdmin: true },
          { type: 'PARKING', amount: 100_000, approvedByAdmin: true },
          { type: 'OTHER', amount: 50_000, approvedByAdmin: false }, // rejected — skip
        ],
      }),
    ];
    const t = calculateSettlementTotals(bookings);
    expect(t.totalBaseAmount).toBe(2_000_000);
    expect(t.totalExpenses).toBe(400_000);
    expect(t.totalVat).toBe(240_000);
    expect(t.totalAmount).toBe(2_640_000);
    // identity: base + expenses + vat = total
    expect(t.totalBaseAmount + t.totalExpenses + t.totalVat).toBe(t.totalAmount);
  });

  test('integer math — no float drift', () => {
    const t = calculateSettlementTotals([
      mk({ basePrice: 1_000_001, expenses: [] }),
      mk({ basePrice: 999_999, expenses: [] }),
    ]);
    expect(Number.isInteger(t.totalVat)).toBe(true);
    expect(Number.isInteger(t.totalAmount)).toBe(true);
    expect(t.totalBaseAmount + t.totalExpenses + t.totalVat).toBe(t.totalAmount);
  });
});
