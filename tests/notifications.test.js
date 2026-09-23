// tests/notifications.test.js — In-app notification feed (UC-51)
//
// Real routes (src/api/v1/notifications/*, mounted at /me/notifications, all auth):
//   GET   /me/notifications?unread=&page=&limit=  → { items, total, page, limit, unreadCount }
//   PATCH /me/notifications/read-all              → { updated }
//   PATCH /me/notifications/:id/read              → { notification }
//
// There is NO dedicated unread-count endpoint — the count rides along on the
// list response (`unreadCount`), so that is what we assert.
//
// Rows are seeded directly via prisma. Strategy mirrors bookings.test.js.
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
let otherUser;
let otherNotification; // belongs to otherUser — used for the 403 case
const seededIds = [];

beforeAll(async () => {
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  user = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Notif Tester',
      phone: `082${stamp}`.slice(0, 11),
      email: `notif_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  token = signToken(user.id);

  otherUser = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Notif Other',
      phone: `083${stamp}`.slice(0, 11),
      email: `notif2_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });

  // Seed 3 unread + 1 read for `user`. createdAt spaced so ordering is stable.
  const base = new Date('2025-04-01T10:00:00.000Z');
  const mk = (i, isRead) => ({
    userId: user.id,
    type: 'BOOKING_CONFIRMED',
    title: `Notif ${i}`,
    body: `body ${i}`,
    isRead,
    createdAt: new Date(base.getTime() + i * 60_000),
  });
  const rows = [mk(1, false), mk(2, false), mk(3, false), mk(4, true)];
  for (const data of rows) {
    const n = await prisma.notification.create({ data });
    seededIds.push(n.id);
  }

  otherNotification = await prisma.notification.create({
    data: { userId: otherUser.id, type: 'PROMO', title: 'Other', isRead: false },
  });
  seededIds.push(otherNotification.id);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { id: { in: seededIds } } }).catch(() => {});
  await prisma.user.delete({ where: { id: otherUser?.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user?.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('me/notifications — auth guard', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${BASE}/me/notifications`);
    expect(res.status).toBe(401);
  });
});

describe('me/notifications — list', () => {
  it('GET list → newest first, includes unreadCount', async () => {
    const res = await request(app)
      .get(`${BASE}/me/notifications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.unreadCount).toBe(3);
    expect(res.body.data.items.length).toBe(4);
    // Newest first: Notif 4 (read) was created last.
    expect(res.body.data.items[0].title).toBe('Notif 4');
    expect(res.body.data.items[3].title).toBe('Notif 1');
  });

  it('GET ?unread=true → only unread rows, total reflects unread filter', async () => {
    const res = await request(app)
      .get(`${BASE}/me/notifications?unread=true`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.items.every((n) => n.isRead === false)).toBe(true);
    expect(res.body.data.unreadCount).toBe(3);
  });

  it('GET ?page=2&limit=2 → paginates', async () => {
    const res = await request(app)
      .get(`${BASE}/me/notifications?page=2&limit=2`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(2);
    expect(res.body.data.items.length).toBe(2);
    expect(res.body.data.total).toBe(4);
  });
});

describe('me/notifications — mark read', () => {
  it('PATCH :id/read → marks one read', async () => {
    const target = seededIds[0]; // Notif 1, unread
    const res = await request(app)
      .patch(`${BASE}/me/notifications/${target}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notification.isRead).toBe(true);

    const inDb = await prisma.notification.findUnique({ where: { id: target } });
    expect(inDb.isRead).toBe(true);
  });

  it('PATCH :id/read on another user\'s notification → 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/notifications/${otherNotification.id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('PATCH :id/read for a missing notification → 404 NOT_FOUND', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/notifications/99999999/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('PATCH read-all → marks remaining unread read, returns count', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/notifications/read-all`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Notif 1 was already read above; 2 unread remain (Notif 2, Notif 3).
    expect(res.body.data.updated).toBe(2);

    const remaining = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    expect(remaining).toBe(0);
  });

  it('read-all does not touch other users\' notifications', async () => {
    const inDb = await prisma.notification.findUnique({
      where: { id: otherNotification.id },
    });
    expect(inDb.isRead).toBe(false);
  });
});
