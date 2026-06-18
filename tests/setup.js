// tests/setup.js — global Jest setup (runs before each test file)
// Force test environment defaults BEFORE app modules are imported.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
// Lower bcrypt cost for faster tests
process.env.BCRYPT_SALT_ROUNDS = process.env.BCRYPT_SALT_ROUNDS || '4';
// REDIS_URL is irrelevant because ioredis is mocked via moduleNameMapper
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
