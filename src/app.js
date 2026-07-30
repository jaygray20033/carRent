// ─────────────────────────────────────────────────────────────────────
//  src/app.js — Express application (ESM, Prisma, mounts api/v1)
// ─────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import env, { isProd } from './config/env.js';
import logger from './config/logger.js';
import swaggerSpec from './config/swagger.js';
import v1Router from './api/v1/index.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

const app = express();

// Trust the first proxy hop so req.ip / x-forwarded-for reflect the real client
// (needed for VNPay's vnp_IpAddr when running behind nginx/ngrok).
app.set('trust proxy', 1);

// ── Global middleware ─────────────────────────────────────────────────
// Helmet with a CSP that still lets swagger-ui (dev) load its inline assets.
// connectSrc is opened to the configured FE origins so the docs "Try it out"
// and any same-page fetches work; everything else stays on 'self'.
const allowedOrigins = (env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // swagger-ui injects inline <style>/<script> and uses data: images.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...allowedOrigins],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    // Allow cross-origin loading of static /uploads assets by the FE.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS: strict allow-list. With credentials enabled the spec forbids '*', so a
// request from an unknown origin is simply not granted CORS headers (the
// browser then blocks it) rather than silently allowing every site.
app.use(
  cors({
    origin(origin, cb) {
      // Non-browser clients (curl, server-to-server, same-origin) send no Origin.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
// gzip response compression — reduces payload size on JSON list endpoints.
app.use(compression());
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
