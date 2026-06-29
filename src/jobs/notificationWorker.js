// src/jobs/notificationWorker.js (ESM) — Notification worker
//
// Consumes notificationQueue jobs and sends real email (SMTP) + SMS (mock/Twilio).
//
// Job types:
//   booking-confirmed  → { bookingId, userId, channels[] }  (looks up details, sends)
//   booking-cancelled  → { bookingId, userId, channels[] }
//   send-email         → { to, template, data, subject }    (generic passthrough)
//   send-sms           → { to, message }                    (generic passthrough)
import { Worker } from 'bullmq';
import { bullConnection } from '../integrations/redis.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { sendEmail } from '../integrations/email.js';
import { sendSms } from '../integrations/sms/twilio.adapter.js';
import { env } from '../config/env.js';

const fmtMoney = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

async function handleBookingConfirmed({ bookingId, channels = ['email'] }) {
  const booking = await prisma.booking.findUnique({
    where: { id: Number(bookingId) },
    include: {
      user: true,
      vehicle: { include: { brand: true } },
    },
  });
  if (!booking) {
    logger.warn(`[notification] booking #${bookingId} not found`);
    return;
  }

  const { user, vehicle } = booking;
  const vehicleName = vehicle
    ? `${vehicle.brand?.name ?? ''} ${vehicle.name}`.trim()
    : `Xe #${booking.vehicleId}`;
  const bookingUrl = `${env.FRONTEND_URL}/me/bookings/${booking.id}`;

  if (channels.includes('email') && user?.email) {
    await sendEmail({
      to: user.email,
      template: 'booking-confirmed',
      data: {
        fullName: user.fullName,
        bookingCode: booking.bookingCode,
        vehicleName,
        pickupAt: fmtDate(booking.pickupAt),
        returnAt: fmtDate(booking.returnAt),
        totalAmount: fmtMoney(booking.totalAmount),
        bookingUrl,
      },
    });
  }

  if (channels.includes('sms') && user?.phone) {
    await sendSms({
      to: user.phone,
      message: `OtoRent: Don ${booking.bookingCode} da duoc xac nhan. Tong: ${fmtMoney(
        booking.totalAmount
      )}d. Xem chi tiet tai ${bookingUrl}`,
    });
  }
}

async function handleBookingCancelled({ bookingId, channels = ['email'] }) {
  const booking = await prisma.booking.findUnique({
    where: { id: Number(bookingId) },
    include: { user: true },
  });
  if (!booking) return;
  const { user } = booking;
  if (channels.includes('email') && user?.email) {
    await sendEmail({
      to: user.email,
      template: 'payment-success',
      subject: `Đơn ${booking.bookingCode} đã bị huỷ — OtoRent`,
      data: {
        fullName: user.fullName,
        bookingCode: booking.bookingCode,
        method: '—',
        transactionId: '—',
        amount: fmtMoney(booking.totalAmount),
        bookingUrl: `${env.FRONTEND_URL}/me/bookings/${booking.id}`,
      },
    });
  }
}

export function createNotificationWorker() {
  const worker = new Worker(
    'notificationQueue',
    async (job) => {
      logger.info(`[Worker:notification] ${job.name} ${JSON.stringify(job.data)}`);

      switch (job.name) {
        case 'booking-confirmed':
          await handleBookingConfirmed(job.data);
          break;

        case 'booking-cancelled':
          await handleBookingCancelled(job.data);
          break;

        case 'send-email':
          await sendEmail(job.data);
          break;

        case 'send-sms':
          await sendSms(job.data);
          break;

        default:
          logger.warn(`[Worker:notification] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    { connection: bullConnection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.info(`[Worker:notification] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker:notification] Job ${job?.name} failed: ${err.message}`);
  });

  logger.info('[Worker] Notification worker started');
  return worker;
}
