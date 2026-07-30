// src/api/v1/posts/post.service.js
// Blog public read APIs (UC-21/22/25/26/27).
//   list      — published posts, filter by category/tag/q, cached 5 min
//   featured  — isFeatured published posts
//   detail    — by slug, +author +category +tags, view counter via Redis
//   related   — same category/tag, limit 4
//   search    — MySQL FULLTEXT over (title, content)
import prisma from '../../../config/db.js';
import { redis } from '../../../integrations/redis.js';
import { buildCacheKey, cacheGet, cacheSet } from '../../../utils/cache.js';
import { NotFoundError } from '../../../utils/apiError.js';

const LIST_TTL = 300; // 5 minutes
const VIEW_KEY = (id) => `post:views:${id}`;

// Public card shape for list endpoints.
const cardSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  thumbnailUrl: true,
  publishedAt: true,
  viewCount: true,
  isFeatured: true,
  author: { select: { id: true, fullName: true } },
  category: { select: { id: true, name: true, slug: true } },
};

export const postService = {
  /**
   * UC-21 — paginated list of PUBLISHED posts with optional category/tag/q
   * filters. Result is cached for 5 minutes per distinct filter combination.
   */
  async list({ page = 1, size = 10, category, tag, q }) {
    const key = buildCacheKey('posts:list', { page, size, category, tag, q });
    const hit = await cacheGet(key);
    if (hit) return hit;

    const where = { status: 'PUBLISHED' };
    if (category) where.category = { slug: category };
    if (tag) where.tags = { some: { tag: { slug: tag } } };
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { excerpt: { contains: q } },
      ];
    }

    const skip = (page - 1) * size;
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: size,
        select: cardSelect,
      }),
      prisma.post.count({ where }),
    ]);

    const result = { items, page, size, total, totalPages: Math.ceil(total / size) };
    await cacheSet(key, result, LIST_TTL);
    return result;
  },

  /** UC-21 — post categories with published-post counts, for the list filter. */
  async categories() {
    const cats = await prisma.postCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { posts: { where: { status: 'PUBLISHED' } } } },
      },
    });
    return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, postCount: c._count.posts }));
  },

  /** UC-21 — featured posts (isFeatured = true, PUBLISHED). */
  async featured(limit = 3) {
    return prisma.post.findMany({
      where: { status: 'PUBLISHED', isFeatured: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: cardSelect,
    });
  },

  /**
   * UC-22/25 — post detail by slug, including author, category and tags.
   * The view counter is incremented in Redis (cheap, write-batched) and the
   * returned viewCount reflects DB + pending Redis delta. A cron flushes the
   * Redis counters to the DB every 5 minutes (see viewSyncWorker).
   */
  async detailBySlug(slug) {
    const post = await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        author: { select: { id: true, fullName: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      },
    });
    if (!post) throw new NotFoundError('Post');

    // Increment the view counter in Redis; fall back to a direct DB bump if
    // Redis is unavailable so views are never silently dropped.
    let pendingDelta;
    try {
      pendingDelta = await redis.incr(VIEW_KEY(post.id));
    } catch {
      await prisma.post.update({
        where: { id: post.id },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {});
      pendingDelta = 0;
    }

    return {
      ...post,
      tags: post.tags.map((pt) => pt.tag),
      viewCount: post.viewCount + (pendingDelta > 0 ? pendingDelta : 0),
    };
  },

  /**
   * UC-26 — related posts: same category or sharing any tag, excluding the
   * current post. Limited to 4, most recent first.
   */
  async related(postId, limit = 4) {
    const id = Number(postId);
    const post = await prisma.post.findUnique({
      where: { id },
      select: { categoryId: true, tags: { select: { tagId: true } } },
    });
    if (!post) throw new NotFoundError('Post');

    const tagIds = post.tags.map((t) => t.tagId);
    const orConds = [];
    if (post.categoryId) orConds.push({ categoryId: post.categoryId });
    if (tagIds.length) orConds.push({ tags: { some: { tagId: { in: tagIds } } } });

    return prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: id },
        ...(orConds.length ? { OR: orConds } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: cardSelect,
    });
  },

  /**
   * UC-27 — full-text search over title + content using the MySQL FULLTEXT
   * index. Falls back to a LIKE scan for very short queries (< 3 chars) that
   * the FULLTEXT engine ignores.
   */
  async search({ q, page = 1, size = 10 }) {
    const term = (q || '').trim();
    if (!term) return { items: [], page, size, total: 0, totalPages: 0 };

    const skip = (page - 1) * size;

    if (term.length < 3) {
      const where = {
        status: 'PUBLISHED',
        OR: [{ title: { contains: term } }, { content: { contains: term } }],
      };
      const [items, total] = await Promise.all([
        prisma.post.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take: size, select: cardSelect }),
        prisma.post.count({ where }),
      ]);
      return { items, page, size, total, totalPages: Math.ceil(total / size) };
    }

    // BOOLEAN MODE so partial words (term*) and multi-word queries work.
    const booleanTerm = term
      .split(/\s+/)
      .map((w) => `+${w.replace(/[+\-><()~*"@]/g, '')}*`)
      .filter((w) => w.length > 2)
      .join(' ');

    const rows = await prisma.$queryRaw`
      SELECT id FROM posts
      WHERE status = 'PUBLISHED'
        AND MATCH(title, content) AGAINST(${booleanTerm} IN BOOLEAN MODE)
      ORDER BY MATCH(title, content) AGAINST(${booleanTerm} IN BOOLEAN MODE) DESC
      LIMIT ${size} OFFSET ${skip}
    `;
    const countRows = await prisma.$queryRaw`
      SELECT COUNT(*) AS cnt FROM posts
      WHERE status = 'PUBLISHED'
        AND MATCH(title, content) AGAINST(${booleanTerm} IN BOOLEAN MODE)
    `;
    const total = Number(countRows[0]?.cnt ?? 0);
    const ids = rows.map((r) => Number(r.id));

    // Hydrate in the ranked order returned by the FULLTEXT query.
    const posts = ids.length
      ? await prisma.post.findMany({ where: { id: { in: ids } }, select: cardSelect })
      : [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);

    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  },

  /**
   * Flush pending Redis view counters into the DB. Called by the 5-minute cron.
   * Each `post:views:<id>` key holds the number of views since the last flush;
   * we add it to viewCount and reset the key atomically (GETDEL semantics).
   */
  async flushViewCounters() {
    let cursor = '0';
    let flushed = 0;
    try {
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'post:views:*', 'COUNT', 100);
        cursor = next;
        for (const key of keys) {
          const id = Number(key.split(':').pop());
          // Read-and-delete so concurrent increments after this point start fresh.
          const raw = await redis.getdel(key);
          const delta = Number(raw);
          if (Number.isFinite(id) && delta > 0) {
            await prisma.post.update({
              where: { id },
              data: { viewCount: { increment: delta } },
            }).catch(() => {});
            flushed += 1;
          }
        }
      } while (cursor !== '0');
    } catch {
      // Redis unavailable (noop stub) — nothing to flush.
    }
    return { flushed };
  },
};

export default postService;
