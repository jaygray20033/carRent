// tests/wallet.test.js — Wallet integration tests (UC-44/45/46).
//
// Covers the wallet HTTP surface + the topup→credit lifecycle:
//   GET  /me/wallet                    → balance + info (lazy-creates a wallet),
//   POST /me/wallet/topup              → PENDING payment + checkoutUrl (VNPAY),
//                                        BANK_TRANSFER → PENDING, no checkoutUrl,
//   topup validation guards            → amount < MIN / bad method → 422,
//   confirmTopupSuccess (via mock-confirm) credits the balance + logs a TOPUP txn,
//   replaying the same confirm is idempotent (no double credit),
//   GET  /me/wallet/transactions       → paginated list + type filter.
//
// Redis is the in-memory mock; Prisma talks to the real MySQL. Rate limiting is
// not on the wallet routes, but the payment/checkout paths reuse notification
// enqueue which degrades gracefully in tests (see the warn log — harmless).
import { jest } from '@jest/globals';

process.env.VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || 'TESTTMN';
process.env.VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || 'TESTSECRETKEY';

const request = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);
const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let user;
let token;

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng' },
  });
  user = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Wallet Tester',
      phone: `03${stamp}`.slice(0, 10),
      email: `wallet_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);
});

afterAll(async () => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } }).catch(() => null);
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } }).catch(() => {});
  }
  await prisma.payment.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Wallet — GET /me/wallet (UC-44)', () => {
  it('requires authentication (401 without a token)', async () => {
    const res = await request(app).get(`${BASE}/me/wallet`);
    expect(res.status).toBe(401);
  });

  it('lazily creates a wallet with a 0 balance on first read', async () => {
    const res = await request(app)
      .get(`${BASE}/me/wallet`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wallet.userId).toBe(user.id);
    expect(res.body.data.wallet.balance).toBe(0);
    expect(res.body.data.wallet.currency).toBe('VND');

    // DB now has a wallet row for the user.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet).not.toBeNull();
    expect(wallet.balance).toBe(0);
  });
});

describe('Wallet — topup guards (UC-46)', () => {
  it('rejects an amount below the minimum (422 VALIDATION)', async () => {
    const res = await request(app)
      .post(`${BASE}/me/wallet/topup`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, method: 'VNPAY' }); // MIN is 50,000
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'amount')).toBe(true);
  });

  it('rejects an unsupported method (422 VALIDATION)', async () => {
    const res = await request(app)
      .post(`${BASE}/me/wallet/topup`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100000, method: 'BITCOIN' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'method')).toBe(true);
  });

  it('BANK_TRANSFER topup → PENDING payment, no checkoutUrl, balance unchanged', async () => {
    const res = await request(app)
      .post(`${BASE}/me/wallet/topup`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 200000, method: 'BANK_TRANSFER' });
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(res.body.data.payment.status).toBe('PENDING');
    expect(res.body.data.payment.type).toBe('TOPUP');
    expect(res.body.data.payment.method).toBe('BANK_TRANSFER');

    // Balance must NOT move until the topup is confirmed.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet.balance).toBe(0);
  });
});

describe('Wallet — VNPAY topup credit lifecycle (UC-46)', () => {
  let payment;

  it('VNPAY topup → PENDING payment with a checkoutUrl (payUrl)', async () => {
    const res = await request(app)
      .post(`${BASE}/me/wallet/topup`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500000, method: 'VNPAY' });
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toContain('vnp_SecureHash=');
    expect(res.body.data.payment.status).toBe('PENDING');
    expect(res.body.data.payment.type).toBe('TOPUP');
    payment = res.body.data.payment;

    // Balance still 0 before confirmation.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet.balance).toBe(0);
  });

  it('confirming the topup (mock-confirm) credits the balance + logs a TOPUP txn', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/${payment.id}/mock-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'TOPUP-CONF-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('SUCCESS');

    // Balance credited by exactly the topup amount.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet.balance).toBe(500000);

    // A TOPUP wallet transaction was written with matching before/after balances.
    const txns = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: 'TOPUP', referenceId: payment.id },
    });
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBe(500000);
    expect(txns[0].balanceBefore).toBe(0);
    expect(txns[0].balanceAfter).toBe(500000);
  });

  it('replaying the confirm is idempotent — balance is not credited twice', async () => {
    const res = await request(app)
      .post(`${BASE}/payments/${payment.id}/mock-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'TOPUP-CONF-1' });
    expect(res.status).toBe(200);

    // Balance unchanged (still one credit), and no second TOPUP txn row.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(wallet.balance).toBe(500000);
    const txns = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: 'TOPUP', referenceId: payment.id },
    });
    expect(txns.length).toBe(1);
  });
});

describe('Wallet — GET /me/wallet/transactions (UC-45)', () => {
  it('lists transactions newest-first with pagination meta', async () => {
    const res = await request(app)
      .get(`${BASE}/me/wallet/transactions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // We created exactly one TOPUP txn above.
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.data[0].type).toBe('TOPUP');
  });

  it('filters by type=PAYMENT (none exist → empty list, total 0)', async () => {
    const res = await request(app)
      .get(`${BASE}/me/wallet/transactions?type=PAYMENT`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data.length).toBe(0);
  });

  it('filters by type=TOPUP → returns the topup txn', async () => {
    const res = await request(app)
      .get(`${BASE}/me/wallet/transactions?type=TOPUP`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].type).toBe('TOPUP');
  });

  it('rejects an out-of-range limit (422 VALIDATION)', async () => {
    const res = await request(app)
      .get(`${BASE}/me/wallet/transactions?limit=999`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });
});
