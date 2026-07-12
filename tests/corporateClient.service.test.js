// tests/corporateClient.service.test.js — B2B Day 2 unit tests (UC-61/62/63 helpers)
import {
  generateInviteToken,
  isInviteExpired,
  inviteExpiresAt,
} from '../src/utils/corporateInvite.js';
import { validateTaxCode } from '../src/api/v1/corporate/corporateClient.service.js';
import { INVITE_TTL_MS } from '../src/constants/corporatePricing.js';

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
