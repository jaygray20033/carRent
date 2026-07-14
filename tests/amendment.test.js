// tests/amendment.test.js — ENT-Day 3 contract amendment integration + IDOR
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../src/constants/corporatePricing.js';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 900 + 100);
const sign = (id) => jwt.sign({ userId: id }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Minimal PDF header bytes
const PDF_BYTES = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'utf8');
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let adminRole;
let customerRole;
let otorentAdminToken;
let companyA;
let companyB;
let corpAdminAToken;
let employeeA1Token;
let corpAdminBToken;
let amendment;
let amendmentEffective;

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Admin', description: 'a' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Customer', description: 'c' },
  });

  const otorentAdmin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'OT Admin AMD',
      phone: `080${stamp}`.slice(0, 10),
      email: `otamd_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  otorentAdminToken = sign(otorentAdmin.id);

  companyA = await prisma.corporateClient.create({
    data: {
      name: `AmdCoA ${stamp}`,
      taxCode: `71${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });
  companyB = await prisma.corporateClient.create({
    data: {
      name: `AmdCoB ${stamp}`,
      taxCode: `72${stamp}`.slice(0, 10),
      priceConfig: JSON.stringify(DEFAULT_CORPORATE_PRICE_CONFIG),
      isActive: true,
    },
  });

  const corpAdminA = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin A AMD',
      phone: `081${stamp}`.slice(0, 10),
      email: `adaamd_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminAToken = sign(corpAdminA.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: corpAdminA.id,
      isAdmin: true,
      isActive: true,
    },
  });

  const employeeA1 = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Emp A1 AMD',
      phone: `082${stamp}`.slice(0, 10),
      email: `a1amd_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  employeeA1Token = sign(employeeA1.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyA.id,
      userId: employeeA1.id,
      isAdmin: false,
      isActive: true,
    },
  });

  const corpAdminB = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Admin B AMD',
      phone: `083${stamp}`.slice(0, 10),
      email: `adbamd_${stamp}@ex.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  corpAdminBToken = sign(corpAdminB.id);
  await prisma.corporateEmployee.create({
    data: {
      corporateId: companyB.id,
      userId: corpAdminB.id,
      isAdmin: true,
      isActive: true,
    },
  });
});

afterAll(async () => {
  if (companyA) await prisma.corporateClient.delete({ where: { id: companyA.id } }).catch(() => {});
  if (companyB) await prisma.corporateClient.delete({ where: { id: companyB.id } }).catch(() => {});
});

describe('ENT-Day 3 — amendments', () => {
  test('POST amendment with past effectiveDate → 422', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/amendments`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        amendmentNo: `PL-PAST-${stamp}`,
        title: 'Past',
        content: 'x',
        effectiveDate: new Date(Date.now() - 2 * 86400_000).toISOString(),
      });
    expect(res.status).toBe(422);
  });

  test('POST amendment future OK', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/amendments`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        amendmentNo: `PL-01-${stamp}`,
        title: 'Bổ sung loại xe 29 chỗ',
        content: 'Thêm bảng giá xe 29 chỗ theo phụ lục',
        effectiveDate: new Date(Date.now() + 3 * 86400_000).toISOString(),
        priceConfigDelta: {
          '29_seat': {
            half_day_0_100km: 1500000,
            full_day_150_200km: 2500000,
          },
        },
      });
    expect(res.status).toBe(201);
    amendment = res.body.data.amendment;
    expect(amendment.signedByA).toBe(false);
    expect(amendment.signedByB).toBe(false);
  });

  test('upload non-PDF → 415 or 422', async () => {
    const res = await request(app)
      .post(
        `${BASE}/admin/corporate-clients/${companyA.id}/amendments/${amendment.id}/upload`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .attach('file', PNG_1X1, { filename: 'x.png', contentType: 'image/png' });
    // multer filter throws ValidationError — may be 422; controller also maps 415
    expect([415, 422]).toContain(res.status);
  });

  test('upload PDF → 200', async () => {
    const res = await request(app)
      .post(
        `${BASE}/admin/corporate-clients/${companyA.id}/amendments/${amendment.id}/upload`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .attach('file', PDF_BYTES, { filename: 'pl.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.data.documentUrl || res.body.data.amendment?.documentUrl).toBeTruthy();
  });

  test('sign-b then sign-b again → 409 ALREADY_SIGNED', async () => {
    const res = await request(app)
      .put(
        `${BASE}/admin/corporate-clients/${companyA.id}/amendments/${amendment.id}/sign-b`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.amendment.signedByB).toBe(true);

    const again = await request(app)
      .put(
        `${BASE}/admin/corporate-clients/${companyA.id}/amendments/${amendment.id}/sign-b`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_SIGNED');
  });

  test('employee cannot sign-a → 403', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/me/amendments/${amendment.id}/sign-a`)
      .set('Authorization', `Bearer ${employeeA1Token}`);
    expect(res.status).toBe(403);
  });

  test('corpAdminB cannot sign-a company A → 403/404 (no leak)', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/me/amendments/${amendment.id}/sign-a`)
      .set('Authorization', `Bearer ${corpAdminBToken}`);
    // 404 preferred (scoped findFirst) — does not leak existence of other company's amendment
    expect([403, 404]).toContain(res.status);
  });

  test('corpAdminA cannot create amendment (admin only) → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/amendments`)
      .set('Authorization', `Bearer ${corpAdminAToken}`)
      .send({
        amendmentNo: 'X',
        title: 'nope',
        content: 'nope',
        effectiveDate: new Date(Date.now() + 86400_000).toISOString(),
      });
    expect(res.status).toBe(403);
  });

  test('corpAdminA sign-a → both signed; future date not yet applied', async () => {
    const res = await request(app)
      .put(`${BASE}/corporate/me/amendments/${amendment.id}/sign-a`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.amendment.signedByA).toBe(true);
    expect(res.body.data.amendment.signedByB).toBe(true);
    // future effectiveDate → not effective yet
    expect(res.body.data.amendment.isEffective).toBe(false);

    const again = await request(app)
      .put(`${BASE}/corporate/me/amendments/${amendment.id}/sign-a`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(again.status).toBe(409);
  });

  test('both signed + effectiveDate today → priceConfig gets 29_seat', async () => {
    // Create amendment effective today with price delta, pre-signed both sides via service path
    const create = await request(app)
      .post(`${BASE}/admin/corporate-clients/${companyA.id}/amendments`)
      .set('Authorization', `Bearer ${otorentAdminToken}`)
      .send({
        amendmentNo: `PL-29-${stamp}`,
        title: 'Xe 29 chỗ effective now',
        content: 'Áp dụng ngay',
        effectiveDate: new Date().toISOString(),
        priceConfigDelta: {
          '29_seat': {
            half_day_0_100km: 1500000,
            full_day_150_200km: 2500000,
          },
        },
      });
    expect(create.status).toBe(201);
    amendmentEffective = create.body.data.amendment;

    await request(app)
      .put(
        `${BASE}/admin/corporate-clients/${companyA.id}/amendments/${amendmentEffective.id}/sign-b`
      )
      .set('Authorization', `Bearer ${otorentAdminToken}`);

    const signA = await request(app)
      .put(`${BASE}/corporate/me/amendments/${amendmentEffective.id}/sign-a`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(signA.status).toBe(200);
    expect(signA.body.data.amendment.isEffective).toBe(true);
    expect(signA.body.data.amendment.appliedAt).toBeTruthy();

    // price-config now includes 29_seat
    const price = await request(app)
      .get(`${BASE}/corporate/me/price-config`)
      .set('Authorization', `Bearer ${corpAdminAToken}`);
    expect(price.status).toBe(200);
    const cfg = price.body.data.priceConfig;
    expect(cfg['29_seat']).toBeTruthy();
    expect(cfg['29_seat'].half_day_0_100km).toBe(1_500_000);
  });
});
