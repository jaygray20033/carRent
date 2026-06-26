// ─────────────────────────────────────────────────────────────────────
//  src/app.js — Express application (ESM, Prisma, mounts api/v1)
// ─────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import env from './config/env.js';
import logger from './config/logger.js';
import swaggerSpec from './config/swagger.js';
import v1Router from './api/v1/index.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

const app = express();

// ── Global middleware ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map(s => s.trim()) : '*',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads (local fallback when S3 not configured) ───────────
app.use('/uploads', express.static('uploads'));

// ── Health check ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Swagger docs (dev only) ─────────────────────────────────────────
if (env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// ── API v1 routes ────────────────────────────────────────────────────
app.use(env.API_PREFIX, v1Router);

// ── 404 + Error handler ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
