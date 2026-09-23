// tests/contract-amendment.service.test.js — ENT-Day 3 unit tests
import {
  isAmendmentEffective,
  mergePriceConfig,
} from '../src/services/slaReport.service.js';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

describe('contract-amendment.service (pure helpers)', () => {
  test('effectiveDate future + both signed → isEffective=false', () => {
    const future = new Date(Date.now() + 7 * 86400_000);
    expect(
      isAmendmentEffective({
        signedByA: true,
        signedByB: true,
        effectiveDate: future,
      })
    ).toBe(false);
  });

  test('effectiveDate past + both signed → isEffective=true', () => {
    const past = new Date(Date.now() - 86400_000);
    expect(
      isAmendmentEffective({
        signedByA: true,
        signedByB: true,
        effectiveDate: past,
      })
    ).toBe(true);
  });

  test('only one side signed + date past → isEffective=false', () => {
    const past = new Date(Date.now() - 86400_000);
    expect(
      isAmendmentEffective({
        signedByA: true,
        signedByB: false,
        effectiveDate: past,
      })
    ).toBe(false);
    expect(
      isAmendmentEffective({
        signedByA: false,
        signedByB: true,
        effectiveDate: past,
      })
    ).toBe(false);
  });

  test('mergePriceConfig applies new vehicle type rates', () => {
    const base = { ...DEFAULT_CORPORATE_PRICE_CONFIG };
    const delta = {
      '29_seat': {
        half_day_0_100km: 1500000,
        full_day_150_200km: 2500000,
      },
      '7_seat': {
        full_day_150_200km: 1400000, // override existing
      },
    };
    const merged = mergePriceConfig(base, delta);
    expect(merged['29_seat'].half_day_0_100km).toBe(1_500_000);
    expect(merged['7_seat'].full_day_150_200km).toBe(1_400_000);
    // untouched keys preserved
    expect(merged['7_seat'].half_day_0_100km).toBe(
      DEFAULT_CORPORATE_PRICE_CONFIG['7_seat'].half_day_0_100km
    );
  });
});
