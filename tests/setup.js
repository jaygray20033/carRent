// tests/setup.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Export for use in test files
export { prisma };

// Setup before all tests
beforeAll(async () => {
  // Ensure test DB is migrated
});

// Cleanup after all tests
afterAll(async () => {
  await prisma.$disconnect();
});
