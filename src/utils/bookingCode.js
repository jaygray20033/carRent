// src/utils/bookingCode.js
import { v4 as uuidv4 } from 'uuid';

export const generateBookingCode = () => {
  const prefix = 'BK';
  const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const rand = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}${ymd}${rand}`;
};
