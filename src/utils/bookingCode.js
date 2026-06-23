// ─────────────────────────────────────────────────────────────────────
//  src/utils/bookingCode.js — Generate unique booking codes (UC-14)
//  Format: OTR-YYYYMMDD-XXXXX (e.g. OTR-20260622-A3K9Z)
// ─────────────────────────────────────────────────────────────────────

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,1,I confusion

/**
 * Generate a random alphanumeric string of given length
 */
function randomPart(length = 5) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

/**
 * Generate a booking code: OTR-YYYYMMDD-XXXXX
 * @returns {string}
 */
export function generateBookingCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `OTR-${y}${m}${d}-${randomPart(5)}`;
}

export default generateBookingCode;
