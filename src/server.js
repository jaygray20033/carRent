// ─────────────────────────────────────────────────────────────────────
//  src/server.js — Application entry point (ESM)
// ─────────────────────────────────────────────────────────────────────
import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/db.js';
import { redis } from './integrations/redis.js';
import { startWorkers } from './jobs/worker.js';

const PORT = env.PORT;

async function bootstrap() {
  // 1) Test DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✓ MySQL connected');
  } catch (err) {
    logger.error(`✗ MySQL connection failed: ${err.message}`);
    process.exit(1);
  }

  // 2) Test Redis (optional — app works without it)
  let redisOk = false;
  try {
    if (redis.status !== 'noop') {
      await redis.ping();
      redisOk = true;
      logger.info('✓ Redis connected');
    }
  } catch (err) {
    logger.warn(`⚠ Redis not available: ${err.message}`);
  }

  // 3) Start BullMQ workers if Redis available
  let workersStarted = false;
  if (redisOk) {
    try {
      await startWorkers();
      workersStarted = true;
    } catch (err) {
      logger.warn(`⚠ Workers failed to start: ${err.message}`);
    }
  }

  // 4) Listen
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`
====================================
  CarGoGo API Server
  Port: ${PORT}
  Env: ${env.NODE_ENV}
  Redis: ${redisOk ? 'CONNECTED' : 'UNAVAILABLE'}
  Workers: ${workersStarted ? 'ACTIVE' : 'DISABLED'}
  API: http://localhost:${PORT}${env.API_PREFIX}
====================================`);
  });
}

bootstrap().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
