// src/app.js — Express app setup
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import v1Router from './api/v1/index.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Logger
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Rate limit (apply on API)
app.use(
  env.API_PREFIX,
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ----- Swagger / OpenAPI docs -----
const docsPath = `${env.API_PREFIX}/docs`;
// Raw OpenAPI JSON spec
app.get(`${docsPath}.json`, (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
// Swagger UI (helmet CSP disabled on this sub-path so the UI assets load)
app.use(
  docsPath,
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'CarRent API Docs',
    swaggerOptions: { persistAuthorization: true },
  })
);

// Mount v1
app.use(env.API_PREFIX, v1Router);

// 404 + error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
