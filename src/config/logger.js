// src/config/logger.js
import winston from 'winston';
import { isProd } from './env.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    isProd ? winston.format.json() : combine(colorize(), devFormat)
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
