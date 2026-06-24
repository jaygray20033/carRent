require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 4000;

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/v1', routes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
});

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  const { sequelize } = require('./models');

  try {
    // Sync database (create tables if not exist)
    await sequelize.sync({ alter: false });
    console.log('[DB] Database synced successfully');

    // Try Redis connection
    const { tryConnectRedis, isRedisAvailable } = require('./config/redis');
    const redisOk = await tryConnectRedis();

    // Start BullMQ workers only if Redis is available
    let workersStarted = false;
    if (redisOk) {
      try {
        const { createReleaseHoldWorker } = require('./jobs/releaseHoldWorker');
        const { createNotificationWorker } = require('./jobs/notificationWorker');
        const { createPaymentWorker } = require('./jobs/paymentWorker');
        const { scheduleReleaseHoldCron } = require('./jobs/queue');

        createReleaseHoldWorker();
        createNotificationWorker();
        createPaymentWorker();
        await scheduleReleaseHoldCron();
        workersStarted = true;
        console.log('[Workers] All BullMQ workers started in-process');
      } catch (workerErr) {
        console.warn('[Workers] Failed to start BullMQ workers:', workerErr.message);
      }
    } else {
      console.warn('[Workers] Redis not available. BullMQ workers disabled.');
      console.warn('[Workers] The API will work without Redis. Background jobs need Redis.');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n====================================`);
      console.log(`  OtoRent API Server`);
      console.log(`  Port: ${PORT}`);
      console.log(`  Env: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Redis: ${redisOk ? 'CONNECTED' : 'UNAVAILABLE'}`);
      console.log(`  Workers: ${workersStarted ? 'ACTIVE' : 'DISABLED'}`);
      console.log(`  API: http://localhost:${PORT}/api/v1`);
      console.log(`====================================\n`);
    });
  } catch (err) {
    console.error('[App] Failed to start:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
