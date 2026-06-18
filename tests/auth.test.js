// tests/auth.test.js — Auth happy-path integration tests (UC-01, UC-02, UC-03)
//
// Strategy:
//  - ioredis is replaced by an in-memory fake (see jest.config moduleNameMapper).
//  - The SMS sender is mocked so we can capture the plaintext OTP code that is
//    "sent" during register / resend, making the flow fully deterministic.
//  - Prisma talks to a real MySQL database (CI service container or local).
//
import { jest } from '@jest/globals';
import request from 'supertest';

// --- Mock the SMS integration to capture OTP codes (ESM-style mock) ---
const sentOtps = [];
jest.unstable_mockModule('../src/integrations/sms.js', () => ({
  enqueueSendOtp: jest.fn(async ({ to, code, purpose, ttl }) => {
    sentOtps.push({ to, code, purpose, ttl });
    return { queued: true, to, purpose };
  }),
  default: {},
}));

// Dynamic imports AFTER mocks are registered
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1

// Unique phone/email per run to avoid collisions across re-runs
const stamp = Date.now().toString().slice(-7);
const TEST_USER = {
  fullName: 'Test User',
  phone: `09${stamp}00`.slice(0, 10),
  email: `test_${stamp}@example.com`,
  password: 'Password123',
};

const lastOtpFor = (to, purpose) =>
  [...sentOtps].reverse().find((o) => o.to === to && o.purpose === purpose)?.code;

beforeAll(async () => {
  // Ensure the default CUSTOMER role exists (register depends on it)
  await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  // Clean any leftover test user from previous failed runs
  await prisma.user
    .deleteMany({ where: { OR: [{ phone: TEST_USER.phone }, { email: TEST_USER.email }] } })
    .catch(() => {});
});

afterAll(async () => {
  // Cleanup test data then disconnect
  await prisma.user
    .deleteMany({ where: { OR: [{ phone: TEST_USER.phone }, { email: TEST_USER.email }] } })
    .catch(() => {});
  await prisma.$disconnect();
});

describe('Auth flow — happy path (UC-01, UC-02, UC-03)', () => {
  it('UC-01: registers a new user (PENDING) and sends an OTP', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.phone).toBe(TEST_USER.phone);
    expect(res.body.data.user.status).toBe('PENDING');
    expect(res.body.data.requireOtp).toBe(true);

    // OTP must have been "sent" via the mocked SMS sender
    expect(lastOtpFor(TEST_USER.phone, 'REGISTER')).toMatch(/^\d{6}$/);
  });

  it('UC-03: verifies the REGISTER OTP and activates the account', async () => {
    const code = lastOtpFor(TEST_USER.phone, 'REGISTER');
    expect(code).toBeDefined();

    const res = await request(app).post(`${BASE}/auth/verify-otp`).send({
      identifier: TEST_USER.phone,
      code,
      purpose: 'REGISTER',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // DB state: user should now be ACTIVE
    const user = await prisma.user.findUnique({ where: { phone: TEST_USER.phone } });
    expect(user.status).toBe('ACTIVE');
  });

  it('UC-02: logs in with phone + password and returns tokens', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: TEST_USER.phone,
      password: TEST_USER.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.phone).toBe(TEST_USER.phone);
  });

  it('UC-02: logs in with email + password as well', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: TEST_USER.email,
      password: TEST_USER.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });
});

describe('Auth validation guards', () => {
  it('rejects register with an invalid phone (422)', async () => {
    const res = await request(app).post(`${BASE}/auth/register`).send({
      fullName: 'Bad Phone',
      phone: '123',
      password: 'Password123',
    });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('rejects login with wrong password (401)', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({
      identifier: TEST_USER.phone,
      password: 'WrongPassword999',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
