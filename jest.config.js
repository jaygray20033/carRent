// jest.config.js — ESM-aware Jest config
export default {
  testEnvironment: 'node',
  // ESM: do not transform; rely on Node's native ESM via --experimental-vm-modules
  transform: {},
  testMatch: ['**/tests/**/*.test.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/', '/_legacy/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    // Use an in-memory fake instead of real ioredis during tests
    '^ioredis$': '<rootDir>/tests/__mocks__/ioredis.js',
  },
  verbose: true,
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
};
