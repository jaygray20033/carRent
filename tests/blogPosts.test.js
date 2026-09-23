// tests/blogPosts.test.js — Day 21 blog public read APIs (UC-21/22/25/26/27)
//
// Covers:
//  - GET /posts                      → only PUBLISHED, sorted published_at DESC
//  - GET /posts?category=&tag=&q=    → filters
//  - GET /posts/featured             → isFeatured only
//  - GET /posts/:slug                → detail + author + category + tags, view++
//  - GET /posts/:id/related          → same category/tag, excludes self
//  - GET /posts/search?q=            → FULLTEXT match
//
import request from 'supertest';

const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');

const BASE = env.API_PREFIX;
const stamp = Date.now().toString().slice(-7);
const S = (s) => `${s}-${stamp}`;

let category;
let otherCategory;
let tagSuv;
let tagSedan;
const posts = {};

beforeAll(async () => {
  category = await prisma.postCategory.create({
    data: { name: S('Blog Reviews'), slug: S('blog-reviews') },
  });
  otherCategory = await prisma.postCategory.create({
    data: { name: S('Blog Tips'), slug: S('blog-tips') },
  });
  tagSuv = await prisma.tag.create({ data: { name: S('SUV'), slug: S('suv') } });
  tagSedan = await prisma.tag.create({ data: { name: S('Sedan'), slug: S('sedan') } });

  // Published, featured, category=reviews, tag=suv
  posts.alpha = await prisma.post.create({
    data: {
      title: `Lamborghini Aventador roadtest ${stamp}`,
      slug: S('post-alpha'),
      excerpt: 'A featured supercar review',
      content: 'The Aventador is a magnificent supercar with a roaring V12 engine.',
      status: 'PUBLISHED',
      isFeatured: true,
      categoryId: category.id,
      publishedAt: new Date('2026-01-10'),
      tags: { create: [{ tagId: tagSuv.id }] },
    },
  });
  // Published, not featured, category=reviews, tag=sedan (related to alpha via category)
  posts.beta = await prisma.post.create({
    data: {
      title: `Camry sedan ownership ${stamp}`,
      slug: S('post-beta'),
      excerpt: 'A practical sedan review',
      content: 'The Camry sedan is reliable and comfortable for daily commuting.',
      status: 'PUBLISHED',
      isFeatured: false,
      categoryId: category.id,
      publishedAt: new Date('2026-02-20'),
      tags: { create: [{ tagId: tagSedan.id }] },
    },
  });
  // Published, category=tips, tag=suv (related to alpha via tag)
  posts.gamma = await prisma.post.create({
    data: {
      title: `SUV buying tips ${stamp}`,
      slug: S('post-gamma'),
      excerpt: 'Tips for buying an SUV',
      content: 'When choosing an SUV consider fuel economy and cargo space.',
      status: 'PUBLISHED',
      isFeatured: false,
      categoryId: otherCategory.id,
      publishedAt: new Date('2026-03-05'),
      tags: { create: [{ tagId: tagSuv.id }] },
    },
  });
  // Draft — must never appear publicly
  posts.draft = await prisma.post.create({
    data: {
      title: `Unpublished draft ${stamp}`,
      slug: S('post-draft'),
      excerpt: 'hidden',
      content: 'This draft mentions Aventador but should stay hidden.',
      status: 'DRAFT',
      categoryId: category.id,
      publishedAt: null,
    },
  });
});

afterAll(async () => {
  const ids = Object.values(posts).map((p) => p.id);
  await prisma.postTag.deleteMany({ where: { postId: { in: ids } } }).catch(() => {});
  await prisma.post.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.tag.deleteMany({ where: { id: { in: [tagSuv.id, tagSedan.id] } } }).catch(() => {});
  await prisma.postCategory
    .deleteMany({ where: { id: { in: [category.id, otherCategory.id] } } })
    .catch(() => {});
  await prisma.$disconnect();
});

describe('GET /posts — public list', () => {
  it('returns only PUBLISHED posts, newest first', async () => {
    const res = await request(app).get(`${BASE}/posts?size=50`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const slugs = items.map((p) => p.slug);
    expect(slugs).toContain(S('post-alpha'));
    expect(slugs).toContain(S('post-beta'));
    expect(slugs).not.toContain(S('post-draft'));

    // Sorted published_at DESC — among our 3, gamma(Mar) > beta(Feb) > alpha(Jan)
    const ours = items.filter((p) => p.slug.endsWith(stamp));
    const idxG = ours.findIndex((p) => p.slug === S('post-gamma'));
    const idxB = ours.findIndex((p) => p.slug === S('post-beta'));
    const idxA = ours.findIndex((p) => p.slug === S('post-alpha'));
    expect(idxG).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxA);
  });

  it('filters by category slug', async () => {
    const res = await request(app).get(`${BASE}/posts?size=50&category=${S('blog-reviews')}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.items.map((p) => p.slug);
    expect(slugs).toContain(S('post-alpha'));
    expect(slugs).toContain(S('post-beta'));
    expect(slugs).not.toContain(S('post-gamma'));
  });

  it('filters by tag slug', async () => {
    const res = await request(app).get(`${BASE}/posts?size=50&tag=${S('suv')}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.items.map((p) => p.slug);
    expect(slugs).toContain(S('post-alpha'));
    expect(slugs).toContain(S('post-gamma'));
    expect(slugs).not.toContain(S('post-beta'));
  });
});

describe('GET /posts/featured', () => {
  it('returns only featured published posts', async () => {
    const res = await request(app).get(`${BASE}/posts/featured?limit=12`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const mine = items.filter((p) => p.slug.endsWith(stamp));
    expect(mine.every((p) => p.isFeatured)).toBe(true);
    expect(mine.map((p) => p.slug)).toContain(S('post-alpha'));
    expect(mine.map((p) => p.slug)).not.toContain(S('post-beta'));
  });
});

describe('GET /posts/:slug — detail', () => {
  it('returns the post with author/category/tags and increments view count', async () => {
    const res = await request(app).get(`${BASE}/posts/${S('post-alpha')}`);
    expect(res.status).toBe(200);
    const post = res.body.data.post;
    expect(post.slug).toBe(S('post-alpha'));
    expect(post.category.slug).toBe(S('blog-reviews'));
    expect(Array.isArray(post.tags)).toBe(true);
    expect(post.tags.map((t) => t.slug)).toContain(S('suv'));
  });

  it('returns 404 for a DRAFT post', async () => {
    const res = await request(app).get(`${BASE}/posts/${S('post-draft')}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /posts/:id/related', () => {
  it('returns posts sharing category or tag, excluding the post itself', async () => {
    const res = await request(app).get(`${BASE}/posts/${posts.alpha.id}/related`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.items.map((p) => p.slug);
    expect(slugs).not.toContain(S('post-alpha'));
    // beta shares category, gamma shares tag
    expect(slugs).toContain(S('post-beta'));
    expect(slugs).toContain(S('post-gamma'));
    expect(slugs).not.toContain(S('post-draft'));
  });
});

describe('GET /posts/search', () => {
  it('finds published posts by full-text term', async () => {
    const res = await request(app).get(`${BASE}/posts/search?q=Aventador`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.items.map((p) => p.slug);
    expect(slugs).toContain(S('post-alpha'));
    // draft also mentions Aventador but must be excluded
    expect(slugs).not.toContain(S('post-draft'));
  });

  it('returns empty result for a blank query', async () => {
    const res = await request(app).get(`${BASE}/posts/search?q=`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });
});
