// tests/pricing.test.js — pure pricing/refund helpers (Day 42 coverage push).
// These are DB-free unit tests over the exported helpers in booking.service.js:
//   computeBreakdown, calcTotalDays, computeRefundPercent, findRefundablePayment.
import {
  computeBreakdown,
  calcTotalDays,
  computeRefundPercent,
  findRefundablePayment,
} from '../src/api/v1/bookings/booking.service.js';

describe('calcTotalDays', () => {
  const day = (d) => new Date(`2026-01-${String(d).padStart(2, '0')}T10:00:00Z`);

  it('counts a single 24h span as 1 day', () => {
    expect(calcTotalDays(day(1), day(2))).toBe(1);
  });

  it('counts a 3-day span as 3 days', () => {
    expect(calcTotalDays(day(1), day(4))).toBe(3);
  });

  it('rounds a partial extra day up (ceil)', () => {
    const pickup = new Date('2026-01-01T10:00:00Z');
    const ret = new Date('2026-01-02T12:00:00Z'); // 26h → 2 days
    expect(calcTotalDays(pickup, ret)).toBe(2);
  });

  it('never returns less than 1 day even for a zero/negative span', () => {
    const t = new Date('2026-01-01T10:00:00Z');
    expect(calcTotalDays(t, t)).toBe(1);
    expect(calcTotalDays(day(4), day(1))).toBe(1);
  });
});

describe('computeBreakdown', () => {
  it('computes base price with no insurance and no coupon', () => {
    const b = computeBreakdown({ pricePerDay: 500000, totalDays: 3 });
    expect(b.basePrice).toBe(1500000);
    expect(b.insuranceFee).toBe(0);
    expect(b.subtotal).toBe(1500000);
    expect(b.couponDiscount).toBe(0);
    expect(b.totalAmount).toBe(1500000);
  });

  it('adds a percent-based insurance fee on the base price', () => {
    const b = computeBreakdown({
      pricePerDay: 1000000,
      totalDays: 2,
      insurancePlan: { ratePercent: 10 },
    });
    expect(b.basePrice).toBe(2000000);
    expect(b.insuranceRatePercent).toBe(10);
    expect(b.insuranceFee).toBe(200000);
    expect(b.subtotal).toBe(2200000);
    expect(b.totalAmount).toBe(2200000);
  });

  it('rounds the insurance fee to the nearest integer', () => {
    const b = computeBreakdown({
      pricePerDay: 333333,
      totalDays: 1,
      insurancePlan: { ratePercent: 7 },
    });
    // 333333 * 7 / 100 = 23333.31 → 23333
    expect(b.insuranceFee).toBe(23333);
  });

  it('subtracts a coupon discount from the subtotal', () => {
    const b = computeBreakdown({
      pricePerDay: 500000,
      totalDays: 4,
      couponDiscount: 300000,
    });
    expect(b.subtotal).toBe(2000000);
    expect(b.couponDiscount).toBe(300000);
    expect(b.totalAmount).toBe(1700000);
  });

  it('caps the coupon discount at the subtotal (never negative total)', () => {
    const b = computeBreakdown({
      pricePerDay: 100000,
      totalDays: 1,
      couponDiscount: 999999999,
    });
    expect(b.couponDiscount).toBe(100000);
    expect(b.totalAmount).toBe(0);
  });

  it('combines insurance + coupon correctly', () => {
    const b = computeBreakdown({
      pricePerDay: 1000000,
      totalDays: 3,
      insurancePlan: { ratePercent: 10 },
      couponDiscount: 500000,
    });
    // base 3,000,000 + ins 300,000 = subtotal 3,300,000 − 500,000 = 2,800,000
    expect(b.subtotal).toBe(3300000);
    expect(b.totalAmount).toBe(2800000);
  });
});

describe('computeRefundPercent', () => {
  const base = new Date('2026-06-10T12:00:00Z');
  const hoursBefore = (h) => new Date(base.getTime() + h * 3600 * 1000);

  it('refunds 100% when cancelling ≥48h before pickup', () => {
    expect(computeRefundPercent(hoursBefore(48), base)).toBe(100);
    expect(computeRefundPercent(hoursBefore(72), base)).toBe(100);
  });

  it('refunds 70% when cancelling 24–48h before pickup', () => {
    expect(computeRefundPercent(hoursBefore(24), base)).toBe(70);
    expect(computeRefundPercent(hoursBefore(47), base)).toBe(70);
  });

  it('refunds 30% when cancelling <24h before pickup', () => {
    expect(computeRefundPercent(hoursBefore(1), base)).toBe(30);
    expect(computeRefundPercent(hoursBefore(23), base)).toBe(30);
  });

  it('returns null once the pickup time has passed', () => {
    expect(computeRefundPercent(hoursBefore(-1), base)).toBeNull();
  });
});

describe('findRefundablePayment', () => {
  it('returns null when there are no payments', () => {
    expect(findRefundablePayment([])).toBeNull();
    expect(findRefundablePayment()).toBeNull();
  });

  it('ignores non-BOOKING and non-SUCCESS payments', () => {
    const payments = [
      { type: 'DEPOSIT', status: 'SUCCESS', paidAt: '2026-01-01' },
      { type: 'BOOKING', status: 'FAILED', paidAt: '2026-01-02' },
    ];
    expect(findRefundablePayment(payments)).toBeNull();
  });

  it('picks the most recent successful BOOKING payment', () => {
    const payments = [
      { id: 1, type: 'BOOKING', status: 'SUCCESS', paidAt: '2026-01-01T00:00:00Z' },
      { id: 2, type: 'BOOKING', status: 'SUCCESS', paidAt: '2026-03-01T00:00:00Z' },
      { id: 3, type: 'BOOKING', status: 'SUCCESS', paidAt: '2026-02-01T00:00:00Z' },
    ];
    expect(findRefundablePayment(payments).id).toBe(2);
  });

  it('falls back to createdAt when paidAt is absent', () => {
    const payments = [
      { id: 1, type: 'BOOKING', status: 'SUCCESS', createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, type: 'BOOKING', status: 'SUCCESS', createdAt: '2026-05-01T00:00:00Z' },
    ];
    expect(findRefundablePayment(payments).id).toBe(2);
  });
});
