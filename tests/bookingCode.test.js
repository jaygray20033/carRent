// ─────────────────────────────────────────────────────────────────────
//  tests/bookingCode.test.js — QA: Booking code generation
// ─────────────────────────────────────────────────────────────────────
import { generateBookingCode } from '../src/utils/bookingCode.js';

describe('generateBookingCode()', () => {
  it('should generate a code matching format OTR-YYYYMMDD-XXXXX', () => {
    const code = generateBookingCode();
    expect(code).toMatch(/^OTR-\d{8}-[A-Z2-9]{5}$/);
  });

  it('should generate unique codes on consecutive calls', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateBookingCode());
    }
    // With 5 chars from 32-char alphabet, collisions in 100 are extremely unlikely
    expect(codes.size).toBe(100);
  });

  it("should contain today's date in the code", () => {
    const code = generateBookingCode();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    expect(code).toContain(`${y}${m}${d}`);
  });

  it('should not contain confusing characters (O, 0, 1, I)', () => {
    // Generate many codes and check the random part
    for (let i = 0; i < 50; i++) {
      const code = generateBookingCode();
      const randomPart = code.split('-')[2];
      expect(randomPart).not.toMatch(/[O01I]/);
    }
  });
});
