// src/api/v1/auth/auth.service.js
import prisma from '../../../config/db.js';
import { hashPassword, comparePassword } from '../../../utils/password.js';
import { signAccessToken, signRefreshToken } from '../../../utils/jwt.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../../utils/apiError.js';

const sanitizeUser = (u) => {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return { ...rest, id: rest.id.toString() };
};

const issueTokens = (user) => {
  const payload = { sub: user.id.toString(), role: user.role?.code || 'CUSTOMER' };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

export const authService = {
  async register({ fullName, phone, email, password }) {
    const dupPhone = await prisma.user.findUnique({ where: { phone } });
    if (dupPhone) throw new ConflictError('Phone already exists', 'PHONE_EXISTS');

    if (email) {
      const dupEmail = await prisma.user.findUnique({ where: { email } });
      if (dupEmail) throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
    }

    const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    if (!customerRole) throw new NotFoundError('Default role CUSTOMER');

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        roleId: customerRole.id,
        fullName,
        phone,
        email: email || null,
        passwordHash,
        // NOTE: keep ACTIVE for init demo — production should be PENDING + OTP verify
        status: 'ACTIVE',
      },
      include: { role: true },
    });

    const tokens = issueTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  },

  async login({ identifier, password }) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }] },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedError('Invalid credentials');

    if (user.status === 'LOCKED') throw new UnauthorizedError('Account is locked');

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = issueTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  },

  async refreshToken({ refreshToken }) {
    const { verifyRefreshToken } = await import('../../../utils/jwt.js');
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedError('User not found');

    return issueTokens(user);
  },

  // OTP — stub (production: lưu Redis + gửi SMS)
  async verifyOtp({ identifier, code, purpose }) {
    if (code !== '123456') throw new UnauthorizedError('Invalid OTP');
    return { verified: true, identifier, purpose };
  },
};
