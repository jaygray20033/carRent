// tests/blogModerationE2E.test.js — Day 25 E2E: blog create → publish → read → comment → moderate
//
// Full lifecycle (UC-56 admin CRUD + UC-24 comment moderation):
//   1. Admin creates a DRAFT post via POST /admin/posts
//   2. Draft is NOT visible on the public GET /posts/:slug (404)
//   3. Admin publishes it (PATCH /admin/posts/:id → PUBLISHED)
//   4. Guest reads the published post via GET /posts/:slug
//   5. Customer posts a comment → inserted PENDING, NOT in the public list
//   6. Admin sees it in the moderation queue GET /admin/comments?status=PENDING
//   7. Admin approves it PATCH /admin/comments/:id → APPROVED
//   8. The comment now appears in the public GET /posts/:id/comments list
//   9. A COMMENT_APPROVED notification was created for the author
//
// Strategy mirrors bookings.test.js: real MySQL via Prisma, JWTs minted directly.
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX; // /api/v1
const stamp = Date.now().toString().slice(-7);
const S = (s) => `${s}-${stamp}`;

// Access tokens carry the user id in `sub` (see auth.middleware.js).
const signToken = (userId) => jwt.sign({ sub: String(userId) }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

let adminRole;
let customerRole;
let admin;
let customer;
let adminToken;
let customerToken;
let postId;
let postSlug;
let commentId;

beforeAll(async () => {
  adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'Quản trị viên', description: 'Admin' },
  });
  customerRole = await prisma.role.upsert({
    where: { code: 'CUSTOMER' },
    update: {},
    create: { code: 'CUSTOMER', name: 'Khách hàng', description: 'Người dùng thuê xe' },
  });

  admin = await prisma.user.create({
    data: {
      roleId: adminRole.id,
      fullName: 'Blog Admin',
      phone: `07${stamp}00`.slice(0, 10),
      email: `blogadmin_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  customer = await prisma.user.create({
    data: {
      roleId: customerRole.id,
      fullName: 'Blog Reader',
      phone: `06${stamp}00`.slice(0, 10),
      email: `blogreader_${stamp}@example.com`,
      passwordHash: 'x',
      status: 'ACTIVE',
    },
  });
  adminToken = signToken(admin.id);
  customerToken = signToken(customer.id);
});

afterAll(async () => {
  // FK-safe teardown: notifications + comments → post → users.
  await prisma.notification.deleteMany({ where: { userId: customer.id } }).catch(() => {});
  if (postId) {
    await prisma.comment.deleteMany({ where: { postId } }).catch(() => {});
    await prisma.postTag.deleteMany({ where: { postId } }).catch(() => {});
    await prisma.post.delete({ where: { id: postId } }).catch(() => {});
  }
  await prisma.user.delete({ where: { id: customer.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Blog E2E — create → publish → read → comment → moderate', () => {
  it('admin creates a DRAFT post (UC-56)', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/posts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `E2E lifecycle post ${stamp}`,
        excerpt: 'An end-to-end test article',
        content: 'This article exercises the full blog publish + moderate flow.',
        status: 'DRAFT',
      });

    expect(res.status).toBe(201);
    const post = res.body.data.post;
    postId = post.id;
    postSlug = post.slug;
    expect(post.status).toBe('DRAFT');
    expect(post.slug).toContain('e2e-lifecycle-post');
  });

  it('the DRAFT is NOT publicly readable (404)', async () => {
    const res = await request(app).get(`${BASE}/posts/${postSlug}`);
    expect(res.status).toBe(404);
  });

  it('admin publishes the post (UC-56)', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/posts/${postId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED' });

    expect(res.status).toBe(200);
    const post = res.body.data.post;
    expect(post.status).toBe('PUBLISHED');
    expect(post.publishedAt).toBeTruthy(); // promoted on first publish
  });

  it('a guest can now read the published post (UC-22)', async () => {
    const res = await request(app).get(`${BASE}/posts/${postSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.post.slug).toBe(postSlug);
  });

  it('a customer posts a comment → inserted PENDING (UC-24)', async () => {
    const res = await request(app)
      .post(`${BASE}/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ content: 'Great article, very helpful!' });

    expect(res.status).toBe(201);
    const comment = res.body.data.comment;
    commentId = comment.id;
    expect(comment.status).toBe('PENDING');
  });

  it('the PENDING comment is NOT in the public list yet', async () => {
    const res = await request(app).get(`${BASE}/posts/${postId}/comments`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((c) => c.id);
    expect(ids).not.toContain(commentId);
  });

  it('the author sees their own PENDING comment via /mine', async () => {
    const res = await request(app)
      .get(`${BASE}/posts/${postId}/comments/mine`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    const mine = res.body.data.items.find((c) => c.id === commentId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('PENDING');
  });

  it('admin sees the comment in the moderation queue (UC-24)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/comments?status=PENDING&size=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((c) => c.id);
    expect(ids).toContain(commentId);
  });

  it('a non-admin is forbidden from the moderation queue (403)', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/comments?status=PENDING`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin approves the comment → APPROVED (UC-24)', async () => {
    const res = await request(app)
      .patch(`${BASE}/admin/comments/${commentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.data.comment.status).toBe('APPROVED');
  });

  it('the approved comment now appears in the public list', async () => {
    const res = await request(app).get(`${BASE}/posts/${postId}/comments`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((c) => c.id);
    expect(ids).toContain(commentId);
  });

  it('approving created a COMMENT_APPROVED notification for the author (UC-51)', async () => {
    const notif = await prisma.notification.findFirst({
      where: { userId: customer.id, type: 'COMMENT_APPROVED' },
    });
    expect(notif).not.toBeNull();
    expect(notif.link).toBe(`/magazine/${postSlug}`);
  });
});
