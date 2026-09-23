// tests/trip-expense.calculator.test.js — B2B Day 4 cost summary unit tests
import { buildCostSummary } from '../src/services/tripExpenseCalculator.js';
import { suggestExpenseAmount } from '../src/services/corporatePricing.service.js';

describe('trip-expense.calculator', () => {
  test('TOLL 120k + PARKING 50k + base 1.3M → subtotal 1.47M → VAT 147k → total 1.617M', () => {
    const s = buildCostSummary({
      basePrice: 1_300_000,
      expenses: [
        { type: 'TOLL_ROAD', amount: 120_000, approvedByAdmin: true },
        { type: 'PARKING', amount: 50_000, approvedByAdmin: true },
      ],
    });
    expect(s.subtotal).toBe(1_470_000);
    expect(s.vat10).toBe(147_000);
    expect(s.total).toBe(1_617_000);
  });

  test('rejected expense (approvedByAdmin: false) not in subtotal', () => {
    const s = buildCostSummary({
      basePrice: 1_000_000,
      expenses: [
        { type: 'TOLL_ROAD', amount: 200_000, approvedByAdmin: false },
        { type: 'PARKING', amount: 50_000, approvedByAdmin: true },
      ],
    });
    expect(s.expenseTotal).toBe(50_000);
    expect(s.subtotal).toBe(1_050_000);
    expect(s.expenses).toHaveLength(1);
  });

  test('pending expense (null) not in subtotal', () => {
    const s = buildCostSummary({
      basePrice: 500_000,
      expenses: [{ type: 'OTHER', amount: 99_000, approvedByAdmin: null }],
    });
    expect(s.expenseTotal).toBe(0);
    expect(s.subtotal).toBe(500_000);
  });

  test('EXTRA_KM 7-seat 20km → 120_000', () => {
    expect(suggestExpenseAmount('EXTRA_KM', '7_seat', 20)).toBe(120_000);
  });

  test('OVERTIME 16-seat 2.5h → 150_000', () => {
    expect(suggestExpenseAmount('OVERTIME', '16_seat', 2.5)).toBe(150_000);
  });

  test('OVERNIGHT 7-seat 2 nights → 560_000', () => {
    expect(suggestExpenseAmount('OVERNIGHT', '7_seat', 2)).toBe(560_000);
  });

  test('ONE_WAY_KM 4_5_seat 80km → 880_000', () => {
    expect(suggestExpenseAmount('ONE_WAY_KM', '4_5_seat', 80)).toBe(880_000);
  });

  test('integer math — no float drift on VAT', () => {
    // 1_000_001 * 0.1 would float; we Math.round
    const s = buildCostSummary({
      basePrice: 1_000_001,
      expenses: [],
    });
    expect(Number.isInteger(s.vat10)).toBe(true);
    expect(Number.isInteger(s.total)).toBe(true);
    expect(s.vat10).toBe(100_000); // round(100000.1)
    expect(s.total).toBe(1_100_001);
  });
});
