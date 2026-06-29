// src/api/v1/payments/payment.service.js
import prisma from '../../../config/db.js';
import { NotFoundError, ForbiddenError, AppError } from '../../../utils/apiError.js';
import { walletService } from '../wallet/wallet.service.js';
import { paymentService as checkoutService } from '../../../services/paymentService.js';

export const paymentService = {
  async checkout(userId, { bookingId, method }, ipAddr) {
    const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId.toString() !== userId.toString())
      throw new ForbiddenError('Not your booking');
    if (booking.status !== 'PENDING_PAYMENT')
      throw new AppError('Booking is not pending payment', 400, 'INVALID_STATUS');

    // Wallet pays in-process: atomic deduction, no redirect (UC-19, Day 18).
    if (method === 'WALLET') {
      const { payment, booking: confirmed } = await checkoutService.payWithWallet(booking, userId);
      return { payment, checkoutUrl: null, booking: confirmed };
    }

    // Methods without an online redirect (manual/in-person settlement) just get
    // a PENDING payment row; online providers go through the shared checkout.
    if (method === 'BANK_TRANSFER' || method === 'CASH') {
      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          userId: Number(userId),
          type: 'BOOKING',
          method,
          amount: booking.totalAmount,
          status: 'PENDING',
        },
      });
      return { payment, checkoutUrl: null };
    }

    const { payment, payUrl, txnRef } = await checkoutService.createCheckout(
      { booking, amount: booking.totalAmount, userId },
      method,
      ipAddr
    );
    return { payment, checkoutUrl: payUrl, payUrl, txnRef };
  },

  async getById(userId, id) {
    const payment = await prisma.payment.findUnique({
      where: { id: Number(id) },
      include: { booking: true },
    });
    if (!payment) throw new NotFoundError('Payment');
    // A payment belongs to the user via its own userId (TOPUP) or its booking (BOOKING).
    const ownerId = payment.userId ?? payment.booking?.userId;
    if (ownerId == null || ownerId.toString() !== userId.toString())
      throw new ForbiddenError('Not your payment');
    return payment;
  },

  // Demo: confirm payment success (in production this is called via webhook)
  async confirmSuccess(paymentId, transactionId, rawResponse = {}) {
    const payment = await prisma.payment.findUnique({ where: { id: Number(paymentId) } });
    if (!payment) throw new NotFoundError('Payment');

    // TOPUP payments credit the wallet instead of confirming a booking (Day 16).
    if (payment.type === 'TOPUP') {
      return walletService.confirmTopupSuccess(payment.id, transactionId, rawResponse);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
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
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: 'CONFIRMED' },
      });
      return updated;
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
