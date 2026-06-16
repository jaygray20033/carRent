// src/api/v1/payments/payment.service.js
import prisma from '../../../config/db.js';
import { NotFoundError, ForbiddenError, AppError } from '../../../utils/apiError.js';

export const paymentService = {
  async checkout(userId, { bookingId, method }) {
    const booking = await prisma.booking.findUnique({ where: { id: BigInt(bookingId) } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId.toString() !== userId.toString())
      throw new ForbiddenError('Not your booking');
    if (booking.status !== 'PENDING_PAYMENT')
      throw new AppError('Booking is not pending payment', 400, 'INVALID_STATUS');

    // Create a PENDING payment record (stub — real flow returns a redirect URL from gateway)
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: booking.totalAmount,
        method,
        status: 'PENDING',
      },
    });

    // Mock payment URL — replace with real VNPay/Momo integration
    const checkoutUrl =
      method === 'VNPAY' || method === 'MOMO' || method === 'ZALOPAY'
        ? `https://sandbox.${method.toLowerCase()}.example/checkout?paymentId=${payment.id}`
        : null;

    return { payment, checkoutUrl };
  },

  async getById(userId, id) {
    const payment = await prisma.payment.findUnique({
      where: { id: BigInt(id) },
      include: { booking: true },
    });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.booking.userId.toString() !== userId.toString())
      throw new ForbiddenError('Not your payment');
    return payment;
  },

  // Demo: confirm payment success (in production this is called via webhook)
  async confirmSuccess(paymentId, transactionId, rawResponse = {}) {
    const payment = await prisma.payment.findUnique({ where: { id: BigInt(paymentId) } });
    if (!payment) throw new NotFoundError('Payment');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          transactionId,
          paidAt: new Date(),
          rawResponse,
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
