// ─────────────────────────────────────────────────────────────────────
//  tests/__mocks__/ioredis.js — In-memory Redis fake for tests
//  Supports the subset used by the app: SET (with EX/NX), GET, DEL, TTL,
//  EXPIRE, SETEX, INCR, EXISTS. TTLs are tracked so getHoldTTL works.
// ─────────────────────────────────────────────────────────────────────

class RedisMock {
  constructor() {
    this.store = new Map();
    this.expiry = new Map(); // key → epoch ms when it expires
  }

  _expired(key) {
    const exp = this.expiry.get(key);
    if (exp !== undefined && Date.now() >= exp) {
      this.store.delete(key);
      this.expiry.delete(key);
      return true;
    }
    return false;
  }

  // SET key value [EX seconds] [NX]
  async set(key, value, ...args) {
    this._expired(key);
    const hasNx = args.includes('NX');
    if (hasNx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, String(value));

    const exIndex = args.indexOf('EX');
    if (exIndex !== -1 && args[exIndex + 1] !== undefined) {
      this.expiry.set(key, Date.now() + Number(args[exIndex + 1]) * 1000);
    } else {
      this.expiry.delete(key);
    }
    return 'OK';
  }

  // SETEX key seconds value
  async setex(key, seconds, value) {
    this.store.set(key, String(value));
    this.expiry.set(key, Date.now() + Number(seconds) * 1000);
    return 'OK';
  }

  async get(key) {
    if (this._expired(key)) return null;
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async del(key) {
    const existed = this.store.delete(key);
    this.expiry.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key) {
    if (this._expired(key)) return 0;
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key, seconds) {
    if (this._expired(key) || !this.store.has(key)) return 0;
    this.expiry.set(key, Date.now() + Number(seconds) * 1000);
    return 1;
  }

  // TTL in seconds: -2 missing, -1 no-expire, else remaining seconds.
  async ttl(key) {
    if (this._expired(key) || !this.store.has(key)) return -2;
    const exp = this.expiry.get(key);
    if (exp === undefined) return -1;
    return Math.max(0, Math.ceil((exp - Date.now()) / 1000));
  }

  async incr(key) {
    this._expired(key);
    const next = (Number(this.store.get(key)) || 0) + 1;
    this.store.set(key, String(next));
    return next;
  }

  on() {
    return this;
  }

  connect() {
    return Promise.resolve();
  }

  quit() {
    return Promise.resolve();
  }
}

export default RedisMock;
