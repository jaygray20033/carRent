// tests/cars.test.js — Public car endpoints (BUG-03 regression coverage)
//
// BUG-03: GET /cars/:id must NOT expose soft-deleted (status=RETIRED) vehicles,
// even when the exact id is known. The public list (GET /cars) must also hide
// them. These tests create one AVAILABLE and one RETIRED vehicle directly via
// Prisma and assert the expected visibility.
//
// Strategy mirrors auth.test.js:
//  - ioredis is replaced by an in-memory fake (jest.config moduleNameMapper).
//  - Prisma talks to a real MySQL database (CI service container or local).
//
import { jest } from '@jest/globals';
import request from 'supertest';

// Keep parity with auth.test.js: mock the SMS sender so importing app.js never
// reaches a real integration during the suite.
jest.unstable_mockModule('../src/integrations/sms.js', () => ({
  enqueueSendOtp: jest.fn(async () => ({ queued: true })),
  default: {},
}));

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1

const stamp = Date.now().toString().slice(-7);
const BRAND_SLUG = `test-brand-${stamp}`;
const AVAILABLE_SLUG = `test-available-${stamp}`;
const RETIRED_SLUG = `test-retired-${stamp}`;

let brandId;
let availableId;
let retiredId;

beforeAll(async () => {
  const brand = await prisma.brand.create({
    data: { name: `Test Brand ${stamp}`, slug: BRAND_SLUG, country: 'VN' },
  });
  brandId = brand.id;

  const available = await prisma.vehicle.create({
    data: {
      brandId,
      name: `Available Car ${stamp}`,
      slug: AVAILABLE_SLUG,
      modelYear: 2023,
      licensePlate: `30A-${stamp}`.slice(0, 18),
      pricePerDay: 800000,
      status: 'AVAILABLE',
    },
  });
  availableId = available.id;

  const retired = await prisma.vehicle.create({
    data: {
      brandId,
      name: `Retired Car ${stamp}`,
      slug: RETIRED_SLUG,
      modelYear: 2018,
      licensePlate: `51B-${stamp}`.slice(0, 18),
      pricePerDay: 500000,
      status: 'RETIRED', // soft-deleted
    },
  });
  retiredId = retired.id;
});

afterAll(async () => {
  await prisma.vehicle
    .deleteMany({ where: { id: { in: [availableId, retiredId].filter(Boolean) } } })
    .catch(() => {});
  await prisma.brand.delete({ where: { id: brandId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('GET /cars/:id — public detail (BUG-03)', () => {
  it('returns 200 for an AVAILABLE vehicle', async () => {
    const res = await request(app).get(`${BASE}/cars/${availableId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.car.id).toBe(availableId);
    expect(res.body.data.car.status).toBe('AVAILABLE');
  });

  it('returns 404 for a RETIRED (soft-deleted) vehicle even with the exact id', async () => {
    const res = await request(app).get(`${BASE}/cars/${retiredId}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app).get(`${BASE}/cars/99999999`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /cars — public list (BUG-03)', () => {
  it('includes the AVAILABLE vehicle but hides the RETIRED one', async () => {
    const res = await request(app).get(`${BASE}/cars?limit=100&q=Car ${stamp}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((c) => c.id);
    expect(ids).toContain(availableId);
    expect(ids).not.toContain(retiredId);
  });
});
