// ─────────────────────────────────────────────────────────────────────
//  src/config/prisma.js — Singleton PrismaClient
// ─────────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client';
import env from './env.js';

const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;
