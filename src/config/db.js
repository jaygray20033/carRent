// src/config/db.js - Prisma singleton
import { PrismaClient } from '@prisma/client';
import { isProd } from './env.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProd ? ['error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export default prisma;
