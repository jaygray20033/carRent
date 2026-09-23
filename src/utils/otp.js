// src/utils/otp.js — OTP generation + bcrypt hashing helpers
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Generate a numeric OTP code of the configured length (default 6 digits).
 * Uses Math.random — acceptable for SMS OTP; for higher security use crypto.
 * @returns {string} e.g. "048213"
 */
export const generateOtp = (length = env.OTP_LENGTH) => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

/** Hash an OTP code with bcrypt (cost 12 per spec). */
export const hashOtp = (code) => bcrypt.hash(code, env.BCRYPT_SALT_ROUNDS);

/** Compare a plain OTP code against its bcrypt hash. */
export const compareOtp = (code, hash) => bcrypt.compare(code, hash);
