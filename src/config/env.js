// ─────────────────────────────────────────────────────────────────────
//  src/config/env.js — Centralised environment variables
// ─────────────────────────────────────────────────────────────────────
import 'dotenv/config';

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  APP_URL: process.env.APP_URL || 'http://localhost:4000',
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // Redis
  REDIS_URL: process.env.REDIS_URL || '',

  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',

  // Bcrypt
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,

  // OTP
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH, 10) || 6,
  OTP_TTL_SECONDS: parseInt(process.env.OTP_TTL_SECONDS, 10) || 300,

  // Payments — VNPay (sandbox, fully wired in Day 17)
  VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE || '',
  VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET || '',
  VNPAY_URL: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL || '',
  VNPAY_IPN_URL: process.env.VNPAY_IPN_URL || '',
};

// Named helper exports (used by config/db.js and other modules)
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';

export { env };
export default env;
