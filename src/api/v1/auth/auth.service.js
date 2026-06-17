// src/api/v1/auth/auth.service.js
import { createHash } from 'node:crypto';
import prisma from '../../../config/db.js';
import redis from '../../../integrations/redis.js';
import { enqueueSendOtp } from '../../../integrations/sms.js';
import { hashPassword, comparePassword } from '../../../utils/password.js';
import { generateOtp, hashOtp, compareOtp } from '../../../utils/otp.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  durationToSeconds,
} from '../../../utils/jwt.js';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  GoneError,
  UnprocessableError,
  TooManyRequestsError,
} from '../../../utils/apiError.js';
import { env } from '../../../config/env.js';

// --------------------------------------------------------------------------
//  Constants / Redis key builders
// --------------------------------------------------------------------------
const OTP_TTL = env.OTP_TTL_SECONDS; // 300s (5 min)
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN = 60; // seconds
const OTP_LOCK_SECONDS = 30 * 60; // 30 min lock after 5 wrong OTP

const LOGIN_FAIL_MAX = 5;
const LOGIN_FAIL_TTL = 15 * 60; // 15 min window
const LOGIN_LOCK_SECONDS = 15 * 60; // 15 min lock

const otpKey = (purpose, identifier) => `otp:${purpose}:${identifier}`;
const otpResendKey = (identifier) => `otp_resend:${identifier}`;
const otpLockKey = (identifier) => `otp_lock:${identifier}`;
const loginFailKey = (identifier) => `login_fail:${identifier}`;
const loginLockKey = (identifier) => `login_lock:${identifier}`;
const rtKey = (userId, jti) => `rt:${userId}:${jti}`;

// --------------------------------------------------------------------------
//  Helpers
// --------------------------------------------------------------------------
const sanitizeUser = (u) => {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return {
    ...rest,
    id: rest.id.toString(),
    roleId: rest.roleId,
    role: rest.role ? { id: rest.role.id, code: rest.role.code, name: rest.role.name } : undefined,
  };
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * Issue access + refresh tokens, persist refresh token in DB + Redis whitelist.
 */
const issueTokens = async (user, meta = {}) => {
  const payload = { sub: user.id.toString(), role: user.role?.code || 'CUSTOMER' };
  const accessToken = signAccessToken(payload);
  const { token: refreshToken, jti } = signRefreshToken(payload);

  const refreshTtl = durationToSeconds(env.JWT_REFRESH_EXPIRES);
  const expiresAt = new Date(Date.now() + refreshTtl * 1000);

  // Persist to DB (store hash of token, never plain)
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(`${jti}.${refreshToken}`),
      deviceInfo: meta.deviceInfo || null,
      ipAddress: meta.ipAddress || null,
      expiresAt,
    },
  });

  // Whitelist in Redis: rt:{userId}:{jti}
  try {
    await redis.set(rtKey(user.id.toString(), jti), '1', 'EX', refreshTtl);
  } catch {
    /* Redis optional for whitelist persistence; DB is source of truth */
  }

  return { accessToken, refreshToken };
};

// --------------------------------------------------------------------------
//  Service
// --------------------------------------------------------------------------
export const authService = {
  /**
   * UC-01 Register: tạo user PENDING + Wallet + sinh OTP (hash bcrypt vào Redis)
   */
  async register({ fullName, phone, email, password }) {
    const cleanEmail = email && email.length ? email : null;

    // Check trùng phone / email
    const dupPhone = await prisma.user.findUnique({ where: { phone } });
    if (dupPhone) throw new ConflictError('Phone already exists', 'PHONE_EXISTS');

    if (cleanEmail) {
      const dupEmail = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (dupEmail) throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
    }

    const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    if (!customerRole) throw new NotFoundError('Default role CUSTOMER');

    const passwordHash = await hashPassword(password);

    // Tạo user PENDING + Wallet liên kết (transaction)
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          roleId: customerRole.id,
          fullName,
          phone,
          email: cleanEmail,
          passwordHash,
          status: 'PENDING',
        },
        include: { role: true },
      });
      await tx.wallet.create({ data: { userId: created.id, balance: 0, currency: 'VND' } });
      return created;
    });

    // Sinh OTP 6 số → lưu Redis (hash bcrypt) TTL 5 phút → enqueue job send OTP
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    await redis.set(
      otpKey('REGISTER', phone),
      JSON.stringify({ codeHash, attempts: 0 }),
      'EX',
      OTP_TTL
    );
    await enqueueSendOtp({ to: phone, code, purpose: 'REGISTER', ttl: OTP_TTL });

    return {
      user: sanitizeUser(user),
      requireOtp: true,
      otpPurpose: 'REGISTER',
      message: 'OTP sent. Please verify to activate your account.',
    };
  },

  /**
   * UC-02 Login: fail counter + lock + JWT + RefreshToken DB + Redis whitelist
   */
  async login({ identifier, password }, meta = {}) {
    // Đang bị khóa do nhập sai nhiều lần?
    const locked = await redis.get(loginLockKey(identifier)).catch(() => null);
    if (locked) {
      const ttl = await redis.ttl(loginLockKey(identifier)).catch(() => LOGIN_LOCK_SECONDS);
      throw new ForbiddenError(
        `Account temporarily locked. Try again in ${Math.max(ttl, 0)}s`,
        'LOGIN_LOCKED'
      );
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }] },
      include: { role: true },
    });

    const registerFail = async () => {
      const key = loginFailKey(identifier);
      const count = await redis.incr(key).catch(() => 0);
      if (count === 1) await redis.expire(key, LOGIN_FAIL_TTL).catch(() => {});
      if (count >= LOGIN_FAIL_MAX) {
        await redis.set(loginLockKey(identifier), '1', 'EX', LOGIN_LOCK_SECONDS).catch(() => {});
        await redis.del(key).catch(() => {});
      }
    };

    if (!user) {
      await registerFail();
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      await registerFail();
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Status checks
    if (user.status === 'LOCKED') {
      throw new ForbiddenError('Account is locked', 'ACCOUNT_LOCKED');
    }
    if (user.status === 'PENDING') {
      throw new ForbiddenError('Account not verified. Please verify OTP.', 'ACCOUNT_PENDING');
    }

    // Success → reset fail counter
    await redis.del(loginFailKey(identifier)).catch(() => {});

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await issueTokens(user, meta);
    return { user: sanitizeUser(user), ...tokens };
  },

  /**
   * UC-03 Verify OTP: bcrypt.compare, attempts < 5; sai 5 lần → khóa 30 phút.
   */
  async verifyOtp({ identifier, code, purpose }) {
    // Identifier đang bị khóa do sai OTP quá nhiều?
    const locked = await redis.get(otpLockKey(identifier)).catch(() => null);
    if (locked) {
      const ttl = await redis.ttl(otpLockKey(identifier)).catch(() => OTP_LOCK_SECONDS);
      throw new ForbiddenError(
        `Too many wrong OTP attempts. Locked for ${Math.max(ttl, 0)}s`,
        'OTP_LOCKED'
      );
    }

    const key = otpKey(purpose, identifier);
    const raw = await redis.get(key).catch(() => null);
    if (!raw) throw new GoneError('OTP expired or not found', 'OTP_EXPIRED');

    const record = JSON.parse(raw);
    const match = await compareOtp(code, record.codeHash);

    if (!match) {
      const attempts = (record.attempts || 0) + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(key).catch(() => {});
        await redis.set(otpLockKey(identifier), '1', 'EX', OTP_LOCK_SECONDS).catch(() => {});
        throw new ForbiddenError(
          'Too many wrong OTP attempts. Identifier locked for 30 minutes.',
          'OTP_LOCKED'
        );
      }
      // Update attempts, keep remaining TTL
      const ttl = await redis.ttl(key).catch(() => OTP_TTL);
      await redis
        .set(key, JSON.stringify({ ...record, attempts }), 'EX', ttl > 0 ? ttl : OTP_TTL)
        .catch(() => {});
      throw new UnprocessableError('Invalid OTP code', 'OTP_INVALID', {
        attemptsLeft: OTP_MAX_ATTEMPTS - attempts,
      });
    }

    // Đúng → xóa key, set verified, activate user (REGISTER)
    await redis.del(key).catch(() => {});
    await redis.del(otpLockKey(identifier)).catch(() => {});

    let user = null;
    if (purpose === 'REGISTER') {
      const found = await prisma.user.findFirst({
        where: { OR: [{ phone: identifier }, { email: identifier }] },
        include: { role: true },
      });
      if (found) {
        user = await prisma.user.update({
          where: { id: found.id },
          data: {
            status: 'ACTIVE',
            phoneVerifiedAt: found.phone === identifier ? new Date() : found.phoneVerifiedAt,
            emailVerifiedAt: found.email === identifier ? new Date() : found.emailVerifiedAt,
          },
          include: { role: true },
        });
      }
    }

    return {
      verified: true,
      identifier,
      purpose,
      user: user ? sanitizeUser(user) : undefined,
    };
  },

  /**
   * Resend OTP: rate limit 60s/lần (Redis otp_resend:{identifier} TTL 60).
   */
  async resendOtp({ identifier, purpose }) {
    const cooldownKey = otpResendKey(identifier);
    const exists = await redis.get(cooldownKey).catch(() => null);
    if (exists) {
      const ttl = await redis.ttl(cooldownKey).catch(() => OTP_RESEND_COOLDOWN);
      throw new TooManyRequestsError(
        `Please wait ${Math.max(ttl, 0)}s before requesting a new OTP`,
        'OTP_RESEND_COOLDOWN'
      );
    }

    // For REGISTER, ensure a pending user exists
    if (purpose === 'REGISTER') {
      const found = await prisma.user.findFirst({
        where: { OR: [{ phone: identifier }, { email: identifier }] },
      });
      if (!found) throw new NotFoundError('User');
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    await redis.set(otpKey(purpose, identifier), JSON.stringify({ codeHash, attempts: 0 }), 'EX', OTP_TTL);
    await redis.set(cooldownKey, '1', 'EX', OTP_RESEND_COOLDOWN);
    await enqueueSendOtp({ to: identifier, code, purpose, ttl: OTP_TTL });

    return { resent: true, identifier, purpose, cooldown: OTP_RESEND_COOLDOWN };
  },

  /**
   * Refresh access token using a valid refresh token (checks Redis whitelist).
   */
  async refreshToken({ refreshToken }, meta = {}) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH');
    }

    // Check whitelist
    const whitelisted = await redis.get(rtKey(payload.sub, payload.jti)).catch(() => '1');
    if (whitelisted === null) {
      throw new UnauthorizedError('Refresh token revoked', 'REFRESH_REVOKED');
    }

    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedError('User not found', 'USER_NOT_FOUND');

    // Rotate: revoke old jti, issue new pair
    await redis.del(rtKey(payload.sub, payload.jti)).catch(() => {});
    const tokens = await issueTokens(user, meta);
    return tokens;
  },

  /**
   * Logout: revoke refresh token (Redis whitelist + DB).
   */
  async logout({ refreshToken } = {}) {
    if (!refreshToken) return { loggedOut: true };
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(rtKey(payload.sub, payload.jti)).catch(() => {});
    } catch {
      /* ignore invalid token on logout */
    }
    return { loggedOut: true };
  },
};

export default authService;
