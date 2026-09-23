// tests/corporate-pricing.service.test.js — B2B Day 3 pricing unit tests
import {
  calculateBasePrice,
  suggestExpenseAmount,
} from '../src/services/corporatePricing.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

describe('corporate-pricing.service', () => {
  test('4-5 seat / half_day / 0-100km → 600_000', () => {
    const r = calculateBasePrice({
      vehicleType: '4_5_seat',
      rentalType: 'half_day',
      estimatedKm: 80,
      priceConfig: DEFAULT_CORPORATE_PRICE_CONFIG,
    });
    expect(r.basePrice).toBe(600000);
    expect(r.priceKey).toBe('half_day_0_100km');
  });

  test('7 seat / full_day / 150-200km → 1_300_000', () => {
    const r = calculateBasePrice({
      vehicleType: '7_seat',
      rentalType: 'full_day',
      estimatedKm: 180,
      priceConfig: DEFAULT_CORPORATE_PRICE_CONFIG,
    });
    expect(r.basePrice).toBe(1300000);
    expect(r.priceKey).toBe('full_day_150_200km');
  });

  test('16 seat / half_day / 100-150km → 1_200_000', () => {
    const r = calculateBasePrice({
      vehicleType: '16_seat',
      rentalType: 'half_day',
      estimatedKm: 120,
      priceConfig: DEFAULT_CORPORATE_PRICE_CONFIG,
    });
    expect(r.basePrice).toBe(1200000);
  });

  test('company override priceConfig is used', () => {
    const override = {
      '4_5_seat': { half_day_0_100km: 999000 },
    };
    const r = calculateBasePrice({
      vehicleType: '4_5_seat',
      rentalType: 'half_day',
      estimatedKm: 50,
      priceConfig: override,
    });
    expect(r.basePrice).toBe(999000);
  });

  test('missing config → PRICE_CONFIG_NOT_FOUND', () => {
    try {
      calculateBasePrice({
        vehicleType: '4_5_seat',
        rentalType: 'half_day',
        estimatedKm: 250, // beyond table
        priceConfig: DEFAULT_CORPORATE_PRICE_CONFIG,
      });
      throw new Error('should throw');
    } catch (err) {
      expect(err.code).toBe('PRICE_CONFIG_NOT_FOUND');
    }
  });

  test('suggestExpenseAmount unit rates (AssetHub)', () => {
    expect(suggestExpenseAmount('EXTRA_KM', '7_seat', 20)).toBe(120000);
    expect(suggestExpenseAmount('OVERTIME', '16_seat', 2.5)).toBe(150000);
    expect(suggestExpenseAmount('OVERNIGHT', '7_seat', 2)).toBe(560000);
    expect(suggestExpenseAmount('ONE_WAY_KM', '4_5_seat', 80)).toBe(880000);
  });
});
