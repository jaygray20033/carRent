// ─────────────────────────────────────────────────────────────────────
//  tests/pricing.test.js — QA: Pricing service unit tests (§UC-17)
// ─────────────────────────────────────────────────────────────────────
import { calculate, calculateDays } from '../src/services/pricingService.js';

describe('pricingService', () => {
  // ─── calculateDays ──────────────────────────────────────────────────
  describe('calculateDays()', () => {
    it('should return 1 for same-day rental (< 24h)', () => {
      const days = calculateDays('2026-07-01T08:00:00Z', '2026-07-01T20:00:00Z');
      expect(days).toBe(1);
    });

    it('should return 3 for exactly 3 days', () => {
      const days = calculateDays('2026-07-01T08:00:00Z', '2026-07-04T08:00:00Z');
      expect(days).toBe(3);
    });

    it('should ceil partial days: 2.5 days → 3', () => {
      // 60 hours = 2.5 days → ceil = 3
      const days = calculateDays('2026-07-01T08:00:00Z', '2026-07-03T20:00:00Z');
      expect(days).toBe(3);
    });

    it('should return 5 for exactly 5 days', () => {
      const days = calculateDays('2026-07-01T08:00:00Z', '2026-07-06T08:00:00Z');
      expect(days).toBe(5);
    });

    it('should return minimum 1 even for very short duration', () => {
      const days = calculateDays('2026-07-01T08:00:00Z', '2026-07-01T09:00:00Z');
      expect(days).toBe(1);
    });
  });

  // ─── Test Case 1: 3 ngày self-drive ────────────────────────────────
  describe('Test Case 1: 3 days, self-drive, no premium, same pickup/dropoff', () => {
    const result = calculate({
      dailyRate: 1000000, // 1,000,000 VND/day
      days: 3,
      withDriver: false,
      premiumInsurance: false,
      pickupPoint: 'Tân Sơn Nhất',
      dropoffPoint: 'Tân Sơn Nhất', // same → no penalty
      couponValue: 0,
      depositAmount: 5000000,
    });

    it('subtotal = 1,000,000 × 3 = 3,000,000', () => {
      expect(result.subtotal).toBe(3000000);
    });

    it('driver_fee = 0 (self-drive)', () => {
      expect(result.driver_fee).toBe(0);
    });

    it('insurance_fee = 0 (no premium)', () => {
      expect(result.insurance_fee).toBe(0);
    });

    it('dropoff_penalty = 0 (same location)', () => {
      expect(result.dropoff_penalty).toBe(0);
    });

    it('tax = (3,000,000 + 0) × 10% = 300,000', () => {
      expect(result.tax).toBe(300000);
    });

    it('discount = 0', () => {
      expect(result.discount).toBe(0);
    });

    it('deposit = 5,000,000', () => {
      expect(result.deposit).toBe(5000000);
    });

    it('total = 3,000,000 + 0 + 0 + 0 + 300,000 - 0 + 5,000,000 = 8,300,000', () => {
      expect(result.total).toBe(8300000);
    });

    it('breakdown includes correct metadata', () => {
      expect(result.breakdown).toEqual({
        daily_rate: 1000000,
        days: 3,
        with_driver: false,
        driver_rate: 500000,
        premium_insurance: false,
        pickup_point: 'Tân Sơn Nhất',
        dropoff_point: 'Tân Sơn Nhất',
      });
    });
  });

  // ─── Test Case 2: 5 ngày with-driver + premium + drop-off khác ────
  describe('Test Case 2: 5 days, with-driver, premium insurance, different dropoff', () => {
    const result = calculate({
      dailyRate: 1200000, // 1,200,000 VND/day
      days: 5,
      withDriver: true,
      driverRate: 500000, // 500,000 VND/day
      premiumInsurance: true,
      pickupPoint: 'Tân Sơn Nhất',
      dropoffPoint: 'Nội Bài', // different → penalty
      couponValue: 0,
      depositAmount: 5000000,
    });

    it('subtotal = 1,200,000 × 5 = 6,000,000', () => {
      expect(result.subtotal).toBe(6000000);
    });

    it('driver_fee = 500,000 × 5 = 2,500,000', () => {
      expect(result.driver_fee).toBe(2500000);
    });

    it('insurance_fee = 6,000,000 × 10% = 600,000', () => {
      expect(result.insurance_fee).toBe(600000);
    });

    it('dropoff_penalty = 200,000 (different location)', () => {
      expect(result.dropoff_penalty).toBe(200000);
    });

    it('tax = (6,000,000 + 2,500,000) × 10% = 850,000', () => {
      expect(result.tax).toBe(850000);
    });

    it('discount = 0', () => {
      expect(result.discount).toBe(0);
    });

    it('deposit = 5,000,000', () => {
      expect(result.deposit).toBe(5000000);
    });

    it('total = 6,000,000 + 2,500,000 + 600,000 + 200,000 + 850,000 - 0 + 5,000,000 = 15,150,000', () => {
      expect(result.total).toBe(15150000);
    });

    it('breakdown includes correct metadata', () => {
      expect(result.breakdown).toEqual({
        daily_rate: 1200000,
        days: 5,
        with_driver: true,
        driver_rate: 500000,
        premium_insurance: true,
        pickup_point: 'Tân Sơn Nhất',
        dropoff_point: 'Nội Bài',
      });
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('should handle coupon discount', () => {
      const result = calculate({
        dailyRate: 1000000,
        days: 2,
        withDriver: false,
        premiumInsurance: false,
        pickupPoint: 'A',
        dropoffPoint: 'A',
        couponValue: 100000,
        depositAmount: 5000000,
      });
      // subtotal=2M, tax=200k, total = 2M + 0 + 0 + 0 + 200k - 100k + 5M = 7,100,000
      expect(result.total).toBe(7100000);
      expect(result.discount).toBe(100000);
    });

    it('should handle custom deposit amount', () => {
      const result = calculate({
        dailyRate: 800000,
        days: 1,
        withDriver: false,
        premiumInsurance: false,
        pickupPoint: 'X',
        dropoffPoint: 'X',
        couponValue: 0,
        depositAmount: 10000000,
      });
      // subtotal=800k, tax=80k, total = 800k + 0 + 0 + 0 + 80k - 0 + 10M = 10,880,000
      expect(result.total).toBe(10880000);
    });
  });
});
