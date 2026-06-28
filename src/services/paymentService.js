// src/services/paymentService.js
//
// Central payment service.
//
//   createCheckout({ booking | wallet }, method)
//     → create a PENDING Payment row, generate a unique txn_ref (UUID),
//       ask the provider adapter for a payUrl, return { payment, payUrl }.
//
//   handleWebhook(provider, payload)
//     → adapter verifies the signature → update Payment status →
//       run the business callback (confirm booking / credit wallet),
//       release the Redis hold and enqueue a confirmation notification.
import { randomUUID } from 'node:crypto';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { getAdapter } from '../integrations/payments/index.js';
import { walletService } from '../api/v1/wallet/wallet.service.js';
import RedisLockService from './RedisLockService.js';
import { BOOKING_STATUS } from '../config/constants.js';
import { NotFoundError, AppError } from '../utils/apiError.js';

const toIso = (d) => new Date(d).toISOString();

/**
 * Enqueue a notification job. The BullMQ queue is imported lazily so this
 * module doesn't pull in bullmq at load time (keeps unit tests light and lets
 * the enqueue degrade gracefully if the queue/Redis is unavailable).
 */
async function enqueueNotification(name, data) {
  try {
    const { notificationQueue } = await import('../jobs/queue.js');
    await notificationQueue.add(name, data);
  } catch (err) {
    logger.warn(`Failed to enqueue ${name}: ${err.message}`);
  }
}

export const paymentService = {
  /**
   * Create a checkout session for either a booking payment or a wallet topup.
   *
   * @param {Object} args
   * @param {Object} [args.booking] - booking to pay for (BOOKING payment)
   * @param {Object} [args.wallet]  - wallet to top up (TOPUP payment)
   * @param {number} args.amount    - amount in VND
   * @param {number} args.userId    - paying user
   * @param {string} method         - VNPAY | MOMO | ZALOPAY | WALLET
   * @param {string} [ipAddr]       - client IP (needed by VNPay in Day 17)
   * @returns {Promise<{payment: Object, payUrl: string|null, txnRef: string}>}
   */
  async createCheckout({ booking, wallet, amount, userId }, method, ipAddr) {
    const adapter = getAdapter(method);
    const type = booking ? 'BOOKING' : 'TOPUP';
    const txnRef = randomUUID();

    const orderInfo = booking
      ? `Thanh toan don hang ${booking.id}`
      : `Nap tien vao vi ${wallet?.id ?? ''}`.trim();

    const metadata = booking
      ? { purpose: 'BOOKING_PAYMENT', bookingId: Number(booking.id) }
      : { purpose: 'WALLET_TOPUP', walletId: wallet.id };

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking ? Number(booking.id) : null,
        userId: Number(userId),
        type,
        method,
        amount,
        status: 'PENDING',
        txnRef,
        metadata: JSON.stringify(metadata),
      },
    });

    const { payUrl } = await adapter.createPayUrl({
      amount,
      txnRef,
      orderInfo,
      ipAddr,
    });

    logger.info(`Checkout created: payment=${payment.id} method=${method} txnRef=${txnRef}`);
    return { payment, payUrl, txnRef };
  },

  /**
   * Handle a provider webhook / callback.
   * The adapter verifies the signature and returns a normalised result; on a
   * successful payment we run the matching business callback. Idempotent: a
   * payment already marked SUCCESS short-circuits.
   *
   * @param {string} provider - VNPAY | MOMO | ZALOPAY
   * @param {Object} payload  - raw query/body from the provider
   */
  async handleWebhook(provider, payload) {
    const adapter = getAdapter(provider);

    // Adapter verifies signature and returns { txnRef, success, transactionId, raw }.
    const result = adapter.verifyIpn(payload);
    const { txnRef, success, transactionId } = result;

    const payment = await prisma.payment.findUnique({ where: { txnRef } });
    if (!payment) throw new NotFoundError('Payment');

    // Idempotency — a duplicate webhook for an already-settled payment is a no-op.
    if (payment.status === 'SUCCESS') {
      logger.info(`Webhook ignored (already SUCCESS): txnRef=${txnRef}`);
      return payment;
    }

    if (!success) {
      return prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', metadata: mergeRaw(payment.metadata, result) },
      });
    }

    return this.settlePaymentSuccess(payment, transactionId, result);
  },

  /**
   * Mark a payment SUCCESS and run the business callback that matches its type
   * (credit wallet for TOPUP, confirm booking for BOOKING). Runs atomically.
   */
  async settlePaymentSuccess(payment, transactionId, rawResponse = {}) {
    if (payment.type === 'TOPUP') {
      return walletService.confirmTopupSuccess(payment.id, transactionId, rawResponse);
    }

    if (payment.type === 'BOOKING') {
      if (!payment.bookingId) {
        throw new AppError('Booking payment has no booking attached', 500, 'INVALID_PAYMENT');
      }
      const { booking, updated } = await prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            transactionId,
            paidAt: new Date(),
            metadata: mergeRaw(payment.metadata, rawResponse),
          },
        });
        const current = await tx.booking.findUnique({ where: { id: payment.bookingId } });
        const updatedBooking = await tx.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: BOOKING_STATUS.CONFIRMED,
            history: {
              create: {
                fromStatus: current?.status ?? null,
                toStatus: BOOKING_STATUS.CONFIRMED,
                note: `Payment ${payment.method} success`,
                metadata: JSON.stringify({ paymentId: payment.id, transactionId }),
              },
            },
          },
        });
        return { booking: updatedBooking, updated: updatedPayment };
      });

      // Release the Redis hold (best-effort) and notify the renter — outside the
      // DB transaction so external services can't roll back a confirmed booking.
      await RedisLockService.releaseHold(
        booking.vehicleId,
        toIso(booking.pickupAt),
        toIso(booking.returnAt),
        booking.id
      ).catch(() => {});

      await enqueueNotification('booking-confirmed', {
        bookingId: Number(booking.id),
        userId: booking.userId,
        channels: ['email', 'sms'],
      });

      return updated;
    }

    throw new AppError(`Unknown payment type: ${payment.type}`, 500, 'INVALID_PAYMENT');
  },
};

function mergeRaw(metadataStr, raw) {
  let base = {};
  try {
    if (metadataStr) base = JSON.parse(metadataStr);
  } catch {
    base = {};
  }
  return JSON.stringify({ ...base, rawResponse: raw });
}

export default paymentService;
