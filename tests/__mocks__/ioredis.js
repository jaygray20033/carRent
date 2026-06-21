// tests/__mocks__/ioredis.js
// Lightweight in-memory Redis replacement for tests.
// Supports the subset of commands used by auth.service.js:
//   set (with EX), get, del, ttl, incr, expire, keys, scanStream, on
import { EventEmitter } from 'node:events';

class FakeRedis extends EventEmitter {
  constructor() {
    super();
    this.store = new Map(); // key -> { value, expireAt|null }
  }

  _isExpired(entry) {
    return entry.expireAt !== null && Date.now() > entry.expireAt;
  }

  _get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  // set(key, value, 'EX', seconds)
  async set(key, value, mode, seconds) {
    let expireAt = null;
    if (mode && String(mode).toUpperCase() === 'EX' && seconds) {
      expireAt = Date.now() + Number(seconds) * 1000;
    }
    this.store.set(key, { value: String(value), expireAt });
    return 'OK';
  }

  async get(key) {
    const entry = this._get(key);
    return entry ? entry.value : null;
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys.flat()) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }

  async ttl(key) {
    const entry = this._get(key);
    if (!entry) return -2;
    if (entry.expireAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expireAt - Date.now()) / 1000));
  }

  async incr(key) {
    const entry = this._get(key);
    const next = (entry ? parseInt(entry.value, 10) : 0) + 1;
    this.store.set(key, { value: String(next), expireAt: entry ? entry.expireAt : null });
    return next;
  }

  async expire(key, seconds) {
    const entry = this._get(key);
    if (!entry) return 0;
    entry.expireAt = Date.now() + Number(seconds) * 1000;
    this.store.set(key, entry);
    return 1;
  }

  async keys(pattern) {
    // Convert glob pattern (only '*' supported) to regex
    const regex = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
    );
    const result = [];
    for (const [key, entry] of this.store.entries()) {
      if (this._isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) result.push(key);
    }
    return result;
  }

  scanStream({ match }) {
    const stream = new EventEmitter();
    // Defer emission to next tick to mimic async streaming
    process.nextTick(async () => {
      const keys = await this.keys(match || '*');
      stream.emit('data', keys);
      stream.emit('end');
    });
    return stream;
  }

  async quit() {
    this.store.clear();
    return 'OK';
  }

  async flushall() {
    this.store.clear();
    return 'OK';
  }

  disconnect() {
    this.store.clear();
  }
}

// ioredis is a default export (the Redis class)
export default FakeRedis;
export { FakeRedis as Redis };
