// src/api/v1/wallet/wallet.service.js
import { randomUUID } from 'node:crypto';
import prisma from '../../../config/db.js';
import { NotFoundError } from '../../../utils/apiError.js';
import { paymentService } from '../../../services/paymentService.js';

/**
 * Wallet service — UC-44 (view wallet), UC-45 (transactions), UC-46 (topup).
 *
 * A topup creates a Payment record of type=TOPUP (no booking attached),
 * mirroring the booking payment flow: a PENDING payment is created and the
 * caller is redirected to the provider checkout URL. Balance is only credited
 * after the provider confirms success (see confirmTopupSuccess — invoked by
 * the payment webhook / mock-confirm flow).
 */
export const walletService = {
  /** Ensure a wallet exists for the user, creating one lazily if missing. */
  async ensureWallet(userId) {
    const id = Number(userId);
    let wallet = await prisma.wallet.findUnique({ where: { userId: id } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: id, balance: 0, currency: 'VND' },
      });
    }
    return wallet;
  },

  // ── UC-44: GET /me/wallet ──────────────────────────────────────────
  async getWallet(userId) {
    const wallet = await this.ensureWallet(userId);
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance,
      currency: wallet.currency,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  },

  // ── UC-45: GET /me/wallet/transactions ─────────────────────────────
  async listTransactions(userId, { type, page = 1, limit = 20 }) {
    const wallet = await this.ensureWallet(userId);
    const where = { walletId: wallet.id };
    if (type) where.type = type;

    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      prisma.walletTransaction.count({ where }),
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, total, page, limit };
  },

  // ── UC-46 (đầu): POST /me/wallet/topup ─────────────────────────────
  async topup(userId, { amount, method }) {
    const wallet = await this.ensureWallet(userId);

    // BANK_TRANSFER has no online provider — record a PENDING payment that an
    // admin confirms manually once the transfer arrives (no redirect URL).
    if (method === 'BANK_TRANSFER') {
      const payment = await prisma.payment.create({
        data: {
          bookingId: null,
          userId: wallet.userId,
          type: 'TOPUP',
          method,
          amount,
          status: 'PENDING',
          txnRef: randomUUID(),
          metadata: JSON.stringify({ walletId: wallet.id, purpose: 'WALLET_TOPUP' }),
        },
      });
      return { payment, checkoutUrl: null };
    }

    // Online providers (VNPAY/MOMO/ZALOPAY) go through the shared checkout flow.
    const { payment, payUrl } = await paymentService.createCheckout(
      { wallet, amount, userId: wallet.userId },
      method
    );
    return { payment, checkoutUrl: payUrl };
  },

  /**
   * Credit the wallet after a TOPUP payment is confirmed successful.
   * Idempotent: a payment already marked SUCCESS will not be credited twice.
   * (Invoked by the payment webhook / mock-confirm — placeholder for Day 16.)
   */
  async confirmTopupSuccess(paymentId, transactionId, rawResponse = {}) {
    const payment = await prisma.payment.findUnique({ where: { id: Number(paymentId) } });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.type !== 'TOPUP') throw new NotFoundError('Topup payment');
    if (payment.status === 'SUCCESS') return payment; // already credited

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: payment.userId } });
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + payment.amount;

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          transactionId,
          paidAt: new Date(),
          metadata: JSON.stringify({
            ...(payment.metadata ? safeParse(payment.metadata) : {}),
            rawResponse,
          }),
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: wallet.userId,
          type: 'TOPUP',
          amount: payment.amount,
          balanceBefore,
          balanceAfter,
          status: 'SUCCESS',
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          description: `Nạp tiền vào ví qua ${payment.method}`,
        },
      });

      return updatedPayment;
    });
  },
};

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
