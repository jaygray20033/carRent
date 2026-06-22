// tests/__mocks__/ioredis.js
// Mock ioredis for testing — provides a simple in-memory store

class RedisMock {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expireAt && Date.now() > item.expireAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ...args) {
    const item = { value };
    if (args[0] === 'EX' && args[1]) {
      item.expireAt = Date.now() + args[1] * 1000;
    }
    this.store.set(key, item);
    return 'OK';
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return [...this.store.keys()].filter((k) => regex.test(k));
  }

  async flushall() {
    this.store.clear();
    return 'OK';
  }

  disconnect() {}
  quit() {}
}

export default RedisMock;
