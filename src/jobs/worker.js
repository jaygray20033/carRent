/**
 * Standalone worker process
 * Run with: node src/jobs/worker.js
 *
 * This starts all BullMQ workers and the cron scheduler.
 * Can be run separately from the main app for scaling.
 */
require('dotenv').config();

const { createReleaseHoldWorker } = require('./releaseHoldWorker');
const { createNotificationWorker } = require('./notificationWorker');
const { createPaymentWorker } = require('./paymentWorker');
const { scheduleReleaseHoldCron } = require('./queue');

async function startWorkers() {
  console.log('=== Starting OtoRent Workers ===');

  // Initialize DB connection (models need it)
  const { sequelize } = require('../models');
  await sequelize.authenticate();
  console.log('[DB] Connection established');

  // Start workers
  const releaseHoldWorker = createReleaseHoldWorker();
  const notificationWorker = createNotificationWorker();
  const paymentWorker = createPaymentWorker();

  // Schedule cron jobs
  await scheduleReleaseHoldCron();

  console.log('=== All workers started ===');

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
    await releaseHoldWorker.close();
    await notificationWorker.close();
    await paymentWorker.close();
    await sequelize.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkers().catch((err) => {
  console.error('[Worker] Failed to start:', err);
  process.exit(1);
});
