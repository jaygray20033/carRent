// tests/auth.branch.test.js — Auth ERROR/BRANCH paths (guards, not happy-path).
//
// Complements tests/auth.test.js (which owns register→verify→login happy path).
// Here we exercise the branches that raise errors or lock accounts:
//   register duplicate phone/email + validation guards,
//   login wrong-password / unknown / PENDING / LOCKED / lockout-after-5-fails,
//   verify-otp expired / invalid-code / lock-after-5-wrong,
//   resend-otp cooldown + NOT_FOUND,
//   refresh-token rotate / reuse / invalid,
//   logout blacklist.
//
// Setup notes:
//  - ioredis → in-memory fake (jest.config moduleNameMapper); each test file gets
//    its own fresh mock, so the login/OTP counters here don't leak elsewhere.
//  - The auth rate-limit middleware is Redis-backed and WOULD trip after 10 req/min
//    from a single IP, so we disable it (RATE_LIMIT_DISABLED) before importing env.
//  - SMS is mocked so we can read the plaintext OTP that register/resend "send".
import { jest } from '@jest/globals';

// Must be set BEFORE env.js is first imported (it reads process.env once).
process.env.RATE_LIMIT_DISABLED = 'true';

const sentOtps = [];
jest.unstable_mockModule('../src/integrations/sms.js', () => ({
  enqueueSendOtp: jest.fn(async ({ to, code, purpose, ttl }) => {
    sentOtps.push({ to, code, purpose, ttl });
    return { queued: true, to, purpose };
  }),
  default: {},
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { hashPassword } = await import('../src/utils/password.js');

const BASE = env.API_PREFIX;
const PASSWORD = 'Password123';

// Unique, valid VN phones/emails for this run (avoid collisions across re-runs).
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);
const digits = stamp.replace(/\D/g, '').padStart(8, '0').slice(-8); // 8 digits
const phoneOf = (i) => `0${digits}${i}`; // 10 chars → 9 digits after 0 (valid)
const emailOf = (i) => `authb_${i}_${stamp}@example.com`;

const phones = [];
const emails = [];
const track = (p, e) => {
  if (p) phones.push(p);
  if (e) emails.push(e);
  return { phone: p, email: e };
};

const lastOtpFor = (to, purpose) =>
  [...sentOtps].reverse().find((o) => o.to === to && o.purpose === purpose)?.code;

// Directly-seeded users (bypass the OTP flow) for login-branch tests.
let activeUser;
let pendingUser;
let lockedUser;

beforeAll(async () => {
  await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });
  const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  const passwordHash = await hashPassword(PASSWORD);

  const activePhone = phoneOf(0);
  const activeEmail = emailOf(0);
  track(activePhone, activeEmail);
  activeUser = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Active Branch User',
      phone: activePhone,
      email: activeEmail,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const pendingPhone = phoneOf(1);
  track(pendingPhone, null);
  pendingUser = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Pending Branch User',
      phone: pendingPhone,
      passwordHash,
      status: 'PENDING',
    },
  });

  const lockedPhone = phoneOf(2);
  track(lockedPhone, null);
  lockedUser = await prisma.user.create({
    data: {
      roleId: role.id,
      fullName: 'Locked Branch User',
      phone: lockedPhone,
      passwordHash,
      status: 'LOCKED',
    },
  });
});

afterAll(async () => {
  const users = await prisma.user
    .findMany({
      where: { OR: [{ phone: { in: phones } }, { email: { in: emails } }] },
      select: { id: true },
    })
    .catch(() => []);
  const ids = users.map((u) => u.id);
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Auth — register guards', () => {
  it('rejects a duplicate phone with 409 PHONE_EXISTS', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send({
      fullName: 'Dup Phone',
      phone: activeUser.phone, // already exists
      password: PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PHONE_EXISTS');
  });

  it('rejects a duplicate email with 409 EMAIL_EXISTS', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send({
      fullName: 'Dup Email',
      phone: phoneOf(3), // fresh phone, but email collides
      email: activeUser.email,
      password: PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
    // No user should have been created for the fresh phone.
    const leaked = await prisma.user.findUnique({ where: { phone: phoneOf(3) } });
    expect(leaked).toBeNull();
  });

  it('rejects an invalid phone format with 422 VALIDATION', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send({
      fullName: 'Bad Phone',
      phone: '12',
      password: PASSWORD,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('rejects a weak password (no digit) with 422 VALIDATION', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send({
      fullName: 'Weak Pass',
      phone: phoneOf(4),
      password: 'onlyletters',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });
});

// NOTE on error `code`: UnauthorizedError/ForbiddenError (see utils/apiError.js)
// hardcode their code to 'UNAUTHORIZED'/'FORBIDDEN' and IGNORE the second
// constructor argument the service passes (e.g. 'INVALID_CREDENTIALS',
// 'ACCOUNT_PENDING'). So the wire `code` is always the generic one — we assert
// on status + the human message to distinguish the branch that fired.
describe('Auth — login guards', () => {
  it('returns 401 (Invalid credentials) for a wrong password', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: activeUser.phone,
      password: 'WrongPassword999',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 (Invalid credentials) for an unknown identifier', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: emailOf(999),
      password: PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 403 for an unverified (PENDING) account', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: pendingUser.phone,
      password: PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toMatch(/not verified/i);
  });

  it('returns 403 for a LOCKED account', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: lockedUser.phone,
      password: PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('locks the identifier after 5 consecutive failures', async () => {
    const unknown = phoneOf(8); // never created → each attempt fails as unknown
    // 5 failed attempts arm the lock (the 5th still returns 401 as invalid creds).
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app)
        .post(`${BASE}/auth/login`)
        .send({ identifier: unknown, password: 'nope1234' });
      expect(r.status).toBe(401);
    }
    // 6th attempt is short-circuited by the lock → 403 with a "locked" message.
    const locked = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ identifier: unknown, password: 'nope1234' });
    expect(locked.status).toBe(403);
    expect(locked.body.message).toMatch(/locked/i);
  });
});

describe('Auth — verify-otp guards', () => {
  it('returns 410 OTP_EXPIRED when no OTP exists for the identifier', async () => {
    const res = await request(app).post(`${BASE}/auth/verify-otp`).send({
      identifier: phoneOf(6), // never registered → no otp key
      code: '123456',
      purpose: 'REGISTER',
    });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('rejects a wrong code (422 OTP_INVALID) then accepts the correct code and activates', async () => {
    const phone = phoneOf(5);
    const email = emailOf(5);
    track(phone, email);

    const reg = await request(app)
      .post(`${BASE}/auth/register`)
      .send({ fullName: 'OTP Flow', phone, email, password: PASSWORD });
    expect(reg.status).toBe(201);
    const realCode = lastOtpFor(phone, 'REGISTER');
    expect(realCode).toMatch(/^\d{6}$/);

    const wrong = realCode === '111111' ? '222222' : '111111';
    const bad = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ identifier: phone, code: wrong, purpose: 'REGISTER' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('OTP_INVALID');
    expect(bad.body.errors.attemptsLeft).toBe(4);

    const good = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ identifier: phone, code: realCode, purpose: 'REGISTER' });
    expect(good.status).toBe(200);
    expect(good.body.data.verified).toBe(true);

    const dbUser = await prisma.user.findUnique({ where: { phone } });
    expect(dbUser.status).toBe('ACTIVE');
    expect(dbUser.phoneVerifiedAt).not.toBeNull();
  });

  it('locks the identifier after 5 wrong OTP codes (OTP_LOCKED)', async () => {
    const phone = phoneOf(7);
    const email = emailOf(7);
    track(phone, email);

    const reg = await request(app)
      .post(`${BASE}/auth/register`)
      .send({ fullName: 'OTP Lock', phone, email, password: PASSWORD });
    expect(reg.status).toBe(201);
    const realCode = lastOtpFor(phone, 'REGISTER');
    const wrong = realCode === '000000' ? '999999' : '000000';

    // First 4 wrong attempts → 422 with a decreasing attemptsLeft.
    for (let i = 0; i < 4; i += 1) {
      const r = await request(app)
        .post(`${BASE}/auth/verify-otp`)
        .send({ identifier: phone, code: wrong, purpose: 'REGISTER' });
      expect(r.status).toBe(422);
      expect(r.body.errors.attemptsLeft).toBe(4 - i);
    }
    // 5th wrong attempt trips the lock (ForbiddenError → code 'FORBIDDEN').
    const fifth = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ identifier: phone, code: wrong, purpose: 'REGISTER' });
    expect(fifth.status).toBe(403);
    expect(fifth.body.message).toMatch(/too many wrong otp/i);

    // While locked, even the correct code is rejected with 403.
    const afterLock = await request(app)
      .post(`${BASE}/auth/verify-otp`)
      .send({ identifier: phone, code: realCode, purpose: 'REGISTER' });
    expect(afterLock.status).toBe(403);
    expect(afterLock.body.message).toMatch(/locked/i);
  });
});

describe('Auth — resend-otp guards', () => {
  it('enforces the 60s cooldown between resends (429 OTP_RESEND_COOLDOWN)', async () => {
    const phone = phoneOf(5); // registered in the verify-otp flow above (user exists)
    const first = await request(app)
      .post(`${BASE}/auth/resend-otp`)
      .send({ identifier: phone, purpose: 'REGISTER' });
    expect(first.status).toBe(200);
    expect(first.body.data.resent).toBe(true);

    const second = await request(app)
      .post(`${BASE}/auth/resend-otp`)
      .send({ identifier: phone, purpose: 'REGISTER' });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('OTP_RESEND_COOLDOWN');
  });

  it('returns 404 when resending a REGISTER OTP for a non-existent user', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/resend-otp`)
      .send({ identifier: phoneOf(9), purpose: 'REGISTER' }); // never registered
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('Auth — refresh + logout token lifecycle', () => {
  const login = () =>
    request(app).post(`${BASE}/auth/login`).send({
      identifier: activeUser.phone,
      password: PASSWORD,
    });

  it('rotates a valid refresh token into a fresh pair, then rejects reuse of the old one', async () => {
    const loginRes = await login();
    expect(loginRes.status).toBe(200);
    const rt1 = loginRes.body.data.refreshToken;
    expect(rt1).toEqual(expect.any(String));

    const refreshed = await request(app)
      .post(`${BASE}/auth/refresh-token`)
      .send({ refreshToken: rt1 });
    expect(refreshed.status).toBe(200);
    const rt2 = refreshed.body.data.refreshToken;
    expect(rt2).toEqual(expect.any(String));
    expect(rt2).not.toBe(rt1); // rotated (new jti)
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    // Reusing the rotated-out token is rejected.
    const reuse = await request(app)
      .post(`${BASE}/auth/refresh-token`)
      .send({ refreshToken: rt1 });
    // UnauthorizedError also collapses its code to 'UNAUTHORIZED' (see apiError.js);
    // the "revoked" branch is identified by status + message.
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('UNAUTHORIZED');
    expect(reuse.body.message).toMatch(/revoked/i);
  });

  it('rejects a structurally-invalid refresh token with 401', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/refresh-token`)
      .send({ refreshToken: 'not-a-real-jwt-token-000000' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toMatch(/invalid refresh token/i);
  });

  it('blacklists a refresh token on logout so it can no longer be refreshed', async () => {
    const loginRes = await login();
    const rt = loginRes.body.data.refreshToken;

    const out = await request(app).post(`${BASE}/auth/logout`).send({ refreshToken: rt });
    expect(out.status).toBe(200);
    expect(out.body.data.loggedOut).toBe(true);

    const afterLogout = await request(app)
      .post(`${BASE}/auth/refresh-token`)
      .send({ refreshToken: rt });
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.code).toBe('UNAUTHORIZED');
    expect(afterLogout.body.message).toMatch(/revoked/i);
  });

  it('logout without a token is a no-op that still returns 200', async () => {
    const res = await request(app).post(`${BASE}/auth/logout`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.loggedOut).toBe(true);
  });
});
