// src/api/v1/admin/users/adminUser.service.js
// Admin user management (Day 34 — UC-55).
//   - list        : filter by role code, status, free-text q (name/phone/email)
//   - getById     : detail + booking history + wallet + reviews
//   - updateStatus: ACTIVE | LOCKED (+ reason); LOCK revokes all refresh tokens
//   - updateRole  : change a user's role (ADMIN only — the "super-admin" gate)
//   - adjustWallet: manual CREDIT / DEBIT against the user's wallet balance
import prisma from '../../../../config/db.js';
import redis from '../../../../integrations/redis.js';
import { NotFoundError, AppError, ConflictError } from '../../../../utils/apiError.js';

const rtKey = (userId, jti) => `rt:${userId}:${jti}`;

const sanitize = (u) => {
  if (!u) return null;
  const { passwordHash: _pw, ...rest } = u;
  return rest;
};

/**
 * Revoke ALL refresh tokens for a user (Redis whitelist + DB rows). Mirrors the
 * helper in user.service.js — used when an admin LOCKs an account so every
 * active session is forced out.
 */
const revokeAllRefreshTokens = async (userId) => {
  const uid = String(userId);
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
    /* Redis optional — the DB delete below is the source of truth */
  }
  await prisma.refreshToken.deleteMany({ where: { userId: Number(uid) } }).catch(() => {});
};

export const adminUserService = {
  /**
   * UC-55 — Admin user list. Filters:
   *   role   : role code (CUSTOMER | ADMIN | OPERATOR | AGENT)
   *   status : account status (ACTIVE | LOCKED | PENDING)
   *   q      : full name / phone / email (contains)
   */
  async list(query) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (query.status) where.status = query.status;
    if (query.role) where.role = { code: query.role };

    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { fullName: { contains: term } },
        { phone: { contains: term } },
        { email: { contains: term } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          role: { select: { id: true, code: true, name: true } },
          wallet: { select: { balance: true, currency: true } },
          _count: { select: { bookings: true } },
        },
      }),
    ]);

    return { items: items.map(sanitize), total, page, limit };
  },

  /**
   * UC-55 — Full user detail: profile + recent booking history + wallet
   * (with latest transactions) + reviews written by the user.
   */
  async getById(id) {
    const userId = Number(id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { id: true, code: true, name: true } },
        wallet: true,
      },
    });
    if (!user) throw new NotFoundError('User');

    const [bookings, walletTransactions, reviews] = await Promise.all([
      prisma.booking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          vehicle: { select: { id: true, name: true, licensePlate: true } },
        },
      }),
      user.wallet
        ? prisma.walletTransaction.findMany({
            where: { walletId: user.wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
      prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      user: sanitize(user),
      bookings,
      wallet: user.wallet
        ? { ...user.wallet, transactions: walletTransactions }
        : null,
      reviews,
    };
  },

  /**
   * PATCH /admin/users/:id/status — ACTIVE | LOCKED (+ reason).
   * Locking an account revokes every refresh token so all sessions drop.
   */
  async updateStatus(adminId, id, { status, reason }) {
    const userId = Number(id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (Number(adminId) === userId) {
      throw new ConflictError('You cannot change your own account status', 'SELF_STATUS_CHANGE');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status },
      include: { role: { select: { id: true, code: true, name: true } } },
    });

    if (status === 'LOCKED') {
      await revokeAllRefreshTokens(userId);
    }

    return { user: sanitize(updated), reason: reason ?? null };
  },

  /**
   * PATCH /admin/users/:id/role — change a user's role. Gated to ADMIN only at
   * the route layer (the "super-admin" gate). Rejects self-demotion.
   */
  async updateRole(adminId, id, roleCode) {
    const userId = Number(id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (Number(adminId) === userId) {
      throw new ConflictError('You cannot change your own role', 'SELF_ROLE_CHANGE');
    }

    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new NotFoundError('Role');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id },
      include: { role: { select: { id: true, code: true, name: true } } },
    });

    return sanitize(updated);
  },

  /**
   * POST /admin/users/:id/wallet/adjust — manual CREDIT / DEBIT.
   * Creates (or reuses) the user's wallet and records a WalletTransaction with
   * an ADMIN_ADJUST reference. A DEBIT cannot push the balance below zero.
   */
  async adjustWallet(adminId, id, { amount, type, note }) {
    const userId = Number(id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const magnitude = Math.round(Number(amount));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      throw new AppError('Amount must be a positive number', 400, 'INVALID_AMOUNT');
    }
    const delta = type === 'DEBIT' ? -magnitude : magnitude;

    return prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId, balance: 0, currency: 'VND' },
        });
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + delta;
      if (balanceAfter < 0) {
        throw new AppError('Insufficient wallet balance for this debit', 400, 'INSUFFICIENT_BALANCE');
      }

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: type === 'DEBIT' ? 'WITHDRAW' : 'TOPUP',
          amount: delta,
          balanceBefore,
          balanceAfter,
          status: 'SUCCESS',
          referenceType: 'ADMIN_ADJUST',
          referenceId: Number(adminId),
          description: note || `Admin ${type === 'DEBIT' ? 'trừ' : 'nạp'} ví thủ công`,
          metadata: JSON.stringify({ adminId: Number(adminId), adjustType: type }),
        },
      });

      return {
        wallet: { ...wallet, balance: balanceAfter },
        transaction,
      };
    });
  },
};

export default adminUserService;
