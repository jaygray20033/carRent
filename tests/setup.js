// ─────────────────────────────────────────────────────────────────────
//  tests/setup.js — Jest global setup
// ─────────────────────────────────────────────────────────────────────

// Set test environment.
// NOTE: DATABASE_URL is intentionally NOT overridden here — Prisma is MySQL,
// so tests inherit the real connection string from .env (Docker MySQL).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';
// Point at a (fake) Redis URL so config/redis.js constructs an ioredis client,
// which jest.config maps to the in-memory mock (tests/__mocks__/ioredis.js).
// An empty URL would yield the noop stub, breaking the OTP round-trip in auth.
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
