// tests/meAddresses.test.js — Account address book (UC-42 / UC-43)
//
// Real routes (src/api/v1/me/addresses/*, mounted at /me/addresses, all auth):
//   GET    /me/addresses               → { addresses } (default first, then newest)
//   POST   /me/addresses               → 201 { address } (first is auto-default)
//   PATCH  /me/addresses/:id           → { address }
//   PATCH  /me/addresses/:id/default   → { address } (atomic: only one isDefault)
//   DELETE /me/addresses/:id           → { id }  (promotes newest when default removed)
//
// Strategy mirrors bookings.test.js: mint a JWT directly, talk to real MySQL.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7) + Math.floor(Math.random() * 1000);

const signToken = (userId) => jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let customerRole;
let user;
let token;
const createdAddressIds = [];

const addrPayload = (over = {}) => ({
  contactName: 'Nguyen Van A',
  contactPhone: '0912345678',
  line: '123 Le Loi',
  city: 'Ho Chi Minh',
  ...over,
});

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Address Tester',
      phone: `081${stamp}`.slice(0, 11),
      email: `addr_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);
});

afterAll(async () => {
  await prisma.address.deleteMany({ where: { userId: user?.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user?.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('me/addresses — auth guard', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/me/addresses`);
    expect(res.status).toBe(401);
  });
});

describe('me/addresses — CRUD + default behavior', () => {
  it('POST first address → 201 and becomes default automatically', async () => {
    const res = await request(app)
      .post(`${BASE}/me/addresses`)
      .set('Authorization', `Bearer ${token}`)
      .send(addrPayload({ line: 'First St' }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.address.isDefault).toBe(true);
    expect(res.body.data.address.contactName).toBe('Nguyen Van A');
    createdAddressIds.push(res.body.data.address.id);

    const inDb = await prisma.address.findUnique({
      where: { id: res.body.data.address.id },
    });
    expect(inDb.isDefault).toBe(true);
  });

  it('POST second address (no flag) → 201 and stays non-default', async () => {
    const res = await request(app)
      .post(`${BASE}/me/addresses`)
      .set('Authorization', `Bearer ${token}`)
      .send(addrPayload({ line: 'Second St' }));

    expect(res.status).toBe(201);
    expect(res.body.data.address.isDefault).toBe(false);
    createdAddressIds.push(res.body.data.address.id);
  });

  it('POST with isDefault:true → 201, previous default cleared (only one default)', async () => {
    const res = await request(app)
      .post(`${BASE}/me/addresses`)
      .set('Authorization', `Bearer ${token}`)
      .send(addrPayload({ line: 'Third St', isDefault: true }));

    expect(res.status).toBe(201);
    expect(res.body.data.address.isDefault).toBe(true);
    createdAddressIds.push(res.body.data.address.id);

    const defaults = await prisma.address.count({
      where: { userId: user.id, isDefault: true },
    });
    expect(defaults).toBe(1);
  });

  it('GET list → default first, then newest; wrapped as { addresses }', async () => {
    const res = await request(app)
      .get(`${BASE}/me/addresses`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.addresses)).toBe(true);
    expect(res.body.data.addresses.length).toBe(3);
    // The default (Third St) must be first.
    expect(res.body.data.addresses[0].isDefault).toBe(true);
    expect(res.body.data.addresses[0].line).toBe('Third St');
  });

  it('POST with an invalid phone → 422 VALIDATION', async () => {
    const res = await request(app)
      .post(`${BASE}/me/addresses`)
      .set('Authorization', `Bearer ${token}`)
      .send(addrPayload({ contactPhone: '123' }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('PATCH :id → updates fields', async () => {
    const target = createdAddressIds[1]; // Second St, non-default
    const res = await request(app)
      .patch(`${BASE}/me/addresses/${target}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactName: 'Renamed Contact' });

    expect(res.status).toBe(200);
    expect(res.body.data.address.contactName).toBe('Renamed Contact');

    const inDb = await prisma.address.findUnique({ where: { id: target } });
    expect(inDb.contactName).toBe('Renamed Contact');
  });

  it('PATCH :id/default → sets that address default, clears the others', async () => {
    const target = createdAddressIds[0]; // First St
    const res = await request(app)
      .patch(`${BASE}/me/addresses/${target}/default`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.address.isDefault).toBe(true);

    const defaults = await prisma.address.findMany({
      where: { userId: user.id, isDefault: true },
    });
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe(target);
  });

  it('PATCH :id/default for another user\'s address → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/addresses/99999999/default`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('DELETE the default → 200 and a remaining address is promoted to default', async () => {
    // Current default is First St (createdAddressIds[0]).
    const target = createdAddressIds[0];
    const res = await request(app)
      .delete(`${BASE}/me/addresses/${target}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(target);

    const gone = await prisma.address.findUnique({ where: { id: target } });
    expect(gone).toBeNull();

    // Exactly one default still exists among the remaining rows.
    const defaults = await prisma.address.count({
      where: { userId: user.id, isDefault: true },
    });
    expect(defaults).toBe(1);
  });

  it('DELETE a non-existent address → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .delete(`${BASE}/me/addresses/99999999`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
