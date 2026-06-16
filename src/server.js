// src/server.js — Entry point
import app from './app.js';
import { env } from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/db.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚗 CarRent API listening on http://localhost:${env.PORT}`);
  logger.info(`   API base: ${env.APP_URL}${env.API_PREFIX}`);
  logger.info(`   Env: ${env.NODE_ENV}`);
});

const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down…`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Closed gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});
