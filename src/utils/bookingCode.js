const dayjs = require('dayjs');

/**
 * Generate a human-readable booking code
 * Format: BK-YYYYMMDD-XXXX (random 4 chars)
 */
function generateBookingCode() {
  const datePart = dayjs().format('YYYYMMDD');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${datePart}-${randomPart}`;
}

module.exports = { generateBookingCode };
