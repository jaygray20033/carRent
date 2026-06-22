// src/config/env.js
import dotenv from 'dotenv';
dotenv.config();

const required = (key) => {
  const v = process.env[key];
  if (!v) console.warn(`⚠️  Missing env: ${key}`);
  return v;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  APP_URL: process.env.APP_URL || 'http://localhost:4000',
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: process.env.REDIS_URL || '',

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',

  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),

  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || '6', 10),
  OTP_TTL_SECONDS: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  UPLOAD_MAX_SIZE_MB: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),

  // Storage (S3 with local ./uploads fallback)
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_REGION: process.env.S3_REGION || 'ap-southeast-1',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || '',
};

export const isProd = env.NODE_ENV === 'production';
