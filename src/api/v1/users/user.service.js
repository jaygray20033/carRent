// src/api/v1/users/user.service.js
import prisma from '../../../config/db.js';
import redis from '../../../integrations/redis.js';
import { enqueueSendOtp } from '../../../integrations/sms.js';
import { hashPassword, comparePassword } from '../../../utils/password.js';
import { generateOtp, hashOtp, compareOtp } from '../../../utils/otp.js';
import {
  NotFoundError,
  ConflictError,
  UnprocessableError,
  ForbiddenError,
  GoneError,
  TooManyRequestsError,
} from '../../../utils/apiError.js';
import { env } from '../../../config/env.js';

const OTP_TTL = env.OTP_TTL_SECONDS;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN = 60;
const OTP_LOCK_SECONDS = 30 * 60;

// CHANGE_PHONE OTP is keyed by userId (not phone) so the pending new phone can
// be carried in the same Redis record until the user verifies it.
const phoneOtpKey = (userId) => `otp:CHANGE_PHONE:${userId}`;
const phoneOtpLockKey = (userId) => `otp_lock:CHANGE_PHONE:${userId}`;
const phoneResendKey = (userId) => `otp_resend:CHANGE_PHONE:${userId}`;
const rtKey = (userId, jti) => `rt:${userId}:${jti}`;

const sanitize = (u) => {
  if (!u) return null;
  const { passwordHash: _passwordHash, ...rest } = u;
  return rest;
};

/**
 * Revoke ALL refresh tokens for a user (Redis whitelist + DB rows). Used after
 * a password change so every existing session is forced to re-login.
 */
const revokeAllRefreshTokens = async (userId) => {
  const uid = userId.toString();
  try {
    if (typeof redis.scanStream === 'function') {
      await new Promise((resolve, reject) => {
        const stream = redis.scanStream({ match: rtKey(uid, '*'), count: 100 });
        const keys = [];
        stream.on('data', (batch) => keys.push(...batch));
        stream.on('end', async () => {
          if (keys.length) await redis.del(...keys).catch(() => {});
          resolve();
        });
        stream.on('error', reject);
      });
    } else {
      const keys = await redis.keys(rtKey(uid, '*')).catch(() => []);
      if (keys.length) await redis.del(...keys).catch(() => {});
    }
  } catch {
    /* Redis optional — DB delete below is the source of truth */
  }
  await prisma.refreshToken.deleteMany({ where: { userId: Number(uid) } }).catch(() => {});
};

export const userService = {
  async getById(id) {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: { role: true },
    });
    if (!user) throw new NotFoundError('User');
    return sanitize(user);
  },

  async updateProfile(id, data) {
    const payload = { ...data };
    if (data.dateOfBirth) payload.dateOfBirth = new Date(data.dateOfBirth);
    // Never allow mutating identity/security fields through the profile route.
    delete payload.phone;
    delete payload.passwordHash;
    delete payload.roleId;
    delete payload.status;

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: payload,
      include: { role: true },
    });
    return sanitize(user);
  },

  /** POST /me/avatar — persist the uploaded avatar URL. */
  async setAvatar(id, avatarUrl) {
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { avatarUrl },
      include: { role: true },
    });
    return sanitize(user);
  },

  /**
   * POST /me/change-password — verify current password, bcrypt the new one,
   * then revoke every refresh token so all sessions must re-authenticate.
   */
  async changePassword(id, { oldPassword, newPassword }) {
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!user) throw new NotFoundError('User');

    const ok = await comparePassword(oldPassword, user.passwordHash);
    if (!ok) throw new UnprocessableError('Current password is incorrect', 'PASSWORD_MISMATCH');

    if (await comparePassword(newPassword, user.passwordHash)) {
      throw new UnprocessableError(
        'New password must differ from the current one',
        'PASSWORD_SAME'
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await revokeAllRefreshTokens(user.id);

    return { changed: true, message: 'Password changed. Please log in again on other devices.' };
  },

  /**
   * POST /me/change-phone — step 1: validate the new phone is free, generate an
   * OTP and send it to the NEW phone. The pending phone rides in the Redis record.
   */
  async requestPhoneChange(id, { newPhone }) {
    const current = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!current) throw new NotFoundError('User');
    if (current.phone === newPhone) {
      throw new ConflictError('New phone must differ from the current one', 'PHONE_SAME');
    }

    const dup = await prisma.user.findUnique({ where: { phone: newPhone } });
    if (dup) throw new ConflictError('Phone already in use', 'PHONE_EXISTS');

    const cooldownKey = phoneResendKey(id);
    const onCooldown = await redis.get(cooldownKey).catch(() => null);
    if (onCooldown) {
      const ttl = await redis.ttl(cooldownKey).catch(() => OTP_RESEND_COOLDOWN);
      throw new TooManyRequestsError(
        `Please wait ${Math.max(ttl, 0)}s before requesting a new OTP`,
        'OTP_RESEND_COOLDOWN'
      );
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    await redis.set(
      phoneOtpKey(id),
      JSON.stringify({ codeHash, attempts: 0, newPhone }),
      'EX',
      OTP_TTL
    );
    await redis.set(cooldownKey, '1', 'EX', OTP_RESEND_COOLDOWN).catch(() => {});
    await enqueueSendOtp({ to: newPhone, code, purpose: 'CHANGE_PHONE', ttl: OTP_TTL });

    return {
      requested: true,
      newPhone,
      otpPurpose: 'CHANGE_PHONE',
      cooldown: OTP_RESEND_COOLDOWN,
      message: 'OTP sent to the new phone number.',
    };
  },

  /**
   * POST /me/change-phone/verify — step 2: check the OTP, then apply the new
   * phone and stamp phone_verified_at.
   */
  async verifyPhoneChange(id, { code }) {
    const locked = await redis.get(phoneOtpLockKey(id)).catch(() => null);
    if (locked) {
      const ttl = await redis.ttl(phoneOtpLockKey(id)).catch(() => OTP_LOCK_SECONDS);
      throw new ForbiddenError(
        `Too many wrong OTP attempts. Locked for ${Math.max(ttl, 0)}s`,
        'OTP_LOCKED'
      );
    }

    const key = phoneOtpKey(id);
    const raw = await redis.get(key).catch(() => null);
    if (!raw) throw new GoneError('OTP expired or not found', 'OTP_EXPIRED');

    const record = JSON.parse(raw);
    const match = await compareOtp(code, record.codeHash);

    if (!match) {
      const attempts = (record.attempts || 0) + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(key).catch(() => {});
        await redis.set(phoneOtpLockKey(id), '1', 'EX', OTP_LOCK_SECONDS).catch(() => {});
        throw new ForbiddenError(
          'Too many wrong OTP attempts. Locked for 30 minutes.',
          'OTP_LOCKED'
        );
      }
      const ttl = await redis.ttl(key).catch(() => OTP_TTL);
      await redis
        .set(key, JSON.stringify({ ...record, attempts }), 'EX', ttl > 0 ? ttl : OTP_TTL)
        .catch(() => {});
      throw new UnprocessableError('Invalid OTP code', 'OTP_INVALID', {
        attemptsLeft: OTP_MAX_ATTEMPTS - attempts,
      });
    }

    // Re-check the phone is still free (could have been claimed during the TTL).
    const dup = await prisma.user.findUnique({ where: { phone: record.newPhone } });
    if (dup && dup.id !== Number(id)) {
      await redis.del(key).catch(() => {});
      throw new ConflictError('Phone already in use', 'PHONE_EXISTS');
    }

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { phone: record.newPhone, phoneVerifiedAt: new Date() },
      include: { role: true },
    });

    await redis.del(key).catch(() => {});
    await redis.del(phoneOtpLockKey(id)).catch(() => {});
    await redis.del(phoneResendKey(id)).catch(() => {});

    return { changed: true, user: sanitize(user) };
  },
};
