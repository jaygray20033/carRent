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
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // Redis
  REDIS_URL: process.env.REDIS_URL || '',

  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  JWT_ISSUER: process.env.JWT_ISSUER || 'otorent-api',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'otorent-app',

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

  // Email — SMTP. When MAIL_HOST is empty the email integration logs to console
  // instead of sending (keeps dev/CI working without a mail server).
  MAIL_HOST: process.env.MAIL_HOST || '',
  MAIL_PORT: parseInt(process.env.MAIL_PORT, 10) || 587,
  MAIL_SECURE: process.env.MAIL_SECURE === 'true',
  MAIL_USER: process.env.MAIL_USER || '',
  MAIL_PASS: process.env.MAIL_PASS || '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || 'OtoRent',
  MAIL_FROM: process.env.MAIL_FROM || 'no-reply@otorent.vn',

  // SMS — 'mock' logs to console (dev); 'twilio' sends via Twilio.
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'mock',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM: process.env.TWILIO_FROM || '',

  // Rate limiting — set RATE_LIMIT_DISABLED=true in E2E/CI to let the test
  // suite hammer /auth/login from a single IP without tripping the limiter.
  // Force-ignored when NODE_ENV=production (see the guard below) so the limiter
  // is always live in prod regardless of what the environment says.
  RATE_LIMIT_DISABLED: process.env.RATE_LIMIT_DISABLED === 'true',
};

// Named helper exports (used by config/db.js and other modules)
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';

// Fail fast in production if JWT secrets are weak or still on their dev defaults.
// A 32+ char random secret is the minimum for HS256 (§8 security audit).
if (isProd) {
  const weak = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ].filter(([, v]) => !v || v.length < 32 || v.startsWith('dev_'));
  if (weak.length) {
    throw new Error(
      `Insecure JWT secret(s) in production: ${weak
        .map(([k]) => k)
        .join(', ')}. Set random values of at least 32 characters.`
    );
  }
}

export { env };
export default env;
