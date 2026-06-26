// src/utils/bookingCode.js (ESM)
import dayjs from 'dayjs';

// Unambiguous alphabet — excludes O, 0, 1, I to avoid human/OCR confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPart(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateBookingCode() {
  const datePart = dayjs().format('YYYYMMDD');
  return `OTR-${datePart}-${randomPart(5)}`;
}
