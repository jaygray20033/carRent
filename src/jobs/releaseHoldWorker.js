const { Worker } = require('bullmq');
const { Op } = require('sequelize');
const { getRedisConnection } = require('../config/redis');
const { sequelize, Booking, BookingHistory } = require('../models');
const { BOOKING_STATUS } = require('../config/constants');
const RedisLockService = require('../services/RedisLockService');

/**
 * Release-hold worker
 *
 * Scans bookings with status DRAFT or PENDING_PAYMENT
 * where hold_until < now → sets CANCELLED + releases Redis lock
 */
async function processReleaseHold(job) {
  console.log(`[Worker:release-hold] Running scan at ${new Date().toISOString()}`);

  const now = new Date();

  // Find expired bookings
  const expiredBookings = await Booking.findAll({
    where: {
      status: {
        [Op.in]: [BOOKING_STATUS.DRAFT, BOOKING_STATUS.PENDING_PAYMENT],
      },
      hold_until: {
        [Op.lt]: now,
      },
    },
  });

  if (expiredBookings.length === 0) {
    console.log('[Worker:release-hold] No expired bookings found');
    return { cancelled: 0 };
  }

  console.log(`[Worker:release-hold] Found ${expiredBookings.length} expired bookings`);

  let cancelledCount = 0;

  for (const booking of expiredBookings) {
    try {
      await sequelize.transaction(async (t) => {
        const previousStatus = booking.status;

        // Update booking to CANCELLED
        await booking.update({
          status: BOOKING_STATUS.CANCELLED,
          cancel_reason: `Auto-cancelled: ${previousStatus} hold expired (hold_until: ${booking.hold_until})`,
          cancelled_at: now,
        }, { transaction: t });

        // Insert BookingHistory
        await BookingHistory.create({
          booking_id: booking.id,
          from_status: previousStatus,
          to_status: BOOKING_STATUS.CANCELLED,
          changed_by: null, // system
          reason: `Auto-cancelled: ${previousStatus} hold expired`,
          metadata: {
            hold_until: booking.hold_until,
            cancelled_at: now.toISOString(),
            auto: true,
          },
        }, { transaction: t });

        // If coupon was applied during PENDING_PAYMENT, revert coupon usage
        // (CouponUsage only exists after confirm, so only for PENDING_PAYMENT)
        if (previousStatus === BOOKING_STATUS.PENDING_PAYMENT && booking.coupon_id) {
          const { CouponUsage, Coupon } = require('../models');

          await CouponUsage.destroy({
            where: { booking_id: booking.id },
            transaction: t,
          });

          await Coupon.decrement('used_count', {
            where: { id: booking.coupon_id },
            transaction: t,
          });
        }
      });

      // Release Redis lock
      try {
        await RedisLockService.releaseHold(
          booking.car_id,
          booking.start_date,
          booking.end_date,
          booking.id
        );
      } catch (redisErr) {
        console.error(`[Worker:release-hold] Redis release failed for booking ${booking.id}:`, redisErr.message);
      }

      cancelledCount++;
      console.log(`[Worker:release-hold] Cancelled booking #${booking.id} (${booking.booking_code})`);
    } catch (err) {
      console.error(`[Worker:release-hold] Failed to cancel booking #${booking.id}:`, err.message);
    }
  }

  console.log(`[Worker:release-hold] Done. Cancelled ${cancelledCount}/${expiredBookings.length} bookings`);
  return { cancelled: cancelledCount, total: expiredBookings.length };
}

/**
 * Create and start the worker
 */
function createReleaseHoldWorker() {
  const worker = new Worker(
    'bookingQueue',
    async (job) => {
      if (job.name === 'release-hold-job') {
        return processReleaseHold(job);
      }
      console.log(`[Worker:bookingQueue] Unknown job: ${job.name}`);
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  );

  worker.on('completed', (job, result) => {
    if (job.name === 'release-hold-job') {
      console.log(`[Worker:release-hold] Job completed:`, result);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:bookingQueue] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Release-hold worker started');
  return worker;
}

module.exports = { createReleaseHoldWorker, processReleaseHold };
