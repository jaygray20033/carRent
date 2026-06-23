// ─────────────────────────────────────────────────────────────────────
//  tests/__mocks__/ioredis.js — Mock Redis for tests
// ─────────────────────────────────────────────────────────────────────

class RedisMock {
  constructor() {
    this.store = new Map();
  }

  async set(key, value, ...args) {
    // Handle SET key value EX ttl NX
    const nxIndex = args.indexOf('NX');
    if (nxIndex !== -1 && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  on() {
    return this;
  }

  connect() {
    return Promise.resolve();
  }
}

export default RedisMock;
