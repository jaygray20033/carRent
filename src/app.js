// ─────────────────────────────────────────────────────────────────────
//  src/app.js — Express application setup
// ─────────────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import env from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';

// Route imports
import bookingRoutes from './api/v1/bookings/booking.routes.js';

const app = express();

// ─── Security & parsing ─────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ────────────────────────────────────────────────────────
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Health check ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API v1 Routes ──────────────────────────────────────────────────
const prefix = env.API_PREFIX; // /api/v1

app.use(`${prefix}/bookings`, bookingRoutes);

// ─── 404 handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global error handler ───────────────────────────────────────────
app.use(errorHandler);

export default app;
