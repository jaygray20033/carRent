// src/jobs/paymentWorker.js (ESM) — Payment worker scaffold
import { Worker } from 'bullmq';
import { bullConnection } from '../integrations/redis.js';
import { bookingService } from '../api/v1/bookings/booking.service.js';

/**
 * Call the provider's refund API. VNPay sandbox / MoMo have no usable refund
 * endpoint in this project, so we treat the refund as accepted and let the
 * booking flip to REFUNDED. Replace this with a real provider call when a live
 * refund API is wired up.
 */
async function callProviderRefund({ method, amount, txnRef }) {
  console.log(`[Payment] Calling ${method} refund API: txnRef=${txnRef} amount=${amount}`);
  return { success: true, transactionId: `REFUND-${method}-${Date.now()}` };
}

/**
 * Payment worker - handles payment verification, refund processing
 */
export function createPaymentWorker() {
  const worker = new Worker(
    'paymentQueue',
    async (job) => {
      console.log(`[Worker:payment] Processing job: ${job.name}`, job.data);

      switch (job.name) {
        case 'verify-payment':
          console.log(`[Payment] Verifying payment for booking #${job.data.bookingId}`);
          break;

        case 'process-refund': {
          const { bookingId, paymentId } = job.data;
          console.log(`[Payment] Processing refund for booking #${bookingId}`);
          const result = await callProviderRefund(job.data);
          if (!result.success) {
            throw new Error(`Provider refund failed for booking #${bookingId}`);
          }
          await bookingService.settleExternalRefund(bookingId, paymentId, result.transactionId);
          console.log(`[Payment] Booking #${bookingId} refunded`);
          break;
        }

        case 'payment-timeout':
          console.log(`[Payment] Payment timeout for booking #${job.data.bookingId}`);
          break;

        default:
          console.log(`[Worker:payment] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    { connection: bullConnection, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker:payment] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:payment] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Payment worker started');
  return worker;
}
