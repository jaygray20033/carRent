// src/services/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Register a new customer
 */
export async function register({ fullName, phone, email, password }) {
  // Check phone exists
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) throw new AppError(409, 'Phone number already registered');

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new AppError(409, 'Email already registered');
  }

  const customerRole = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName,
      phone,
      email: email || null,
      passwordHash,
      status: 'ACTIVE',
    },
    select: { id: true, fullName: true, phone: true, email: true, status: true },
  });

  // Create wallet
  await prisma.wallet.create({ data: { userId: user.id } });

  return user;
}

/**
 * Login with phone + password
 */
export async function login({ phone, password }) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { role: { select: { code: true, name: true } } },
  });

  if (!user) throw new AppError(401, 'Invalid credentials');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is not active');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  // Update last login
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Generate tokens
  const payload = { userId: user.id, roleCode: user.role.code };
  const accessToken = jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpires });
  const refreshToken = jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Get current user profile
 */
export async function getProfile(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      avatarUrl: true,
      dateOfBirth: true,
      gender: true,
      nationalId: true,
      driverLicense: true,
      status: true,
      createdAt: true,
      role: { select: { code: true, name: true } },
      wallet: { select: { balance: true, currency: true } },
    },
  });
}
