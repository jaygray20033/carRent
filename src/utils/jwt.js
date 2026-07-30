// src/utils/jwt.js
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Sign an access token (default 15m).
 * @param {object} payload - { sub, role, ... }
 */
export const signAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

/**
 * Sign a refresh token (default 7d). A unique `jti` is embedded so the token
 * can be whitelisted in Redis (`rt:{userId}:{jti}`) and tracked in DB.
 * @param {object} payload - { sub, role, ... }
 * @returns {{ token: string, jti: string }}
 */
export const signRefreshToken = (payload) => {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  return { token, jti };
};

const verifyOpts = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, verifyOpts);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, verifyOpts);

/** Decode without verifying signature (used to read exp/jti when needed). */
export const decodeToken = (token) => jwt.decode(token);

/** Parse a duration string like "7d" / "15m" / "3600" into seconds. */
export const durationToSeconds = (val) => {
  if (typeof val === 'number') return val;
  const m = String(val).match(/^(\d+)([smhd])?$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2] || 's';
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * mult;
};
