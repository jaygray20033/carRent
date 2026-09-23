// src/api/v1/admin/posts/adminPost.service.js
// Admin blog CRUD (UC-56).
//   list       — posts in ANY status, filter by status/q, newest first
//   getById    — full post incl. author, category, tags
//   create     — auto-slug from title (unique-suffixed), sets tags[], publishedAt
//   update     — partial; re-slug only if title changes & slug not pinned
//   softDelete — status = ARCHIVED (keeps the row, drops it from public lists)
import prisma from '../../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../../utils/apiError.js';
import { slugify } from '../../../../utils/slug.js';

const detailInclude = {
  author: { select: { id: true, fullName: true } },
  category: { select: { id: true, name: true, slug: true } },
  tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
};

// Flatten the PostTag join rows into a plain tags[] for the client.
const shape = (post) =>
  post ? { ...post, tags: post.tags?.map((pt) => pt.tag) ?? [] } : post;

export const adminPostService = {
  /** UC-56 — admin list, any status, filter by status/q. */
  async list({ status, q, page = 1, size = 20 }) {
    const where = {};
    if (status) where.status = status;
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [{ title: { contains: term } }, { slug: { contains: term } }];
    }

    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: detailInclude,
      }),
      prisma.post.count({ where }),
    ]);

    return { items: items.map(shape), total, page, size };
  },

  async getById(id) {
    const post = await prisma.post.findUnique({
      where: { id: Number(id) },
      include: detailInclude,
    });
    if (!post) throw new NotFoundError('Post');
    return shape(post);
  },

  /**
   * UC-56 — create a post. Slug is derived from the title unless an explicit
   * slug is supplied; a numeric suffix is appended on collision. When the
   * status is PUBLISHED and no publishedAt is given, it defaults to now.
   */
  async create(authorId, data) {
    const { tags = [], slug: rawSlug, ...rest } = data;
    const slug = await this._uniqueSlug(rawSlug || slugify(rest.title));

    const status = rest.status || 'PUBLISHED';
    const publishedAt =
      rest.publishedAt ?? (status === 'PUBLISHED' ? new Date() : null);

    const post = await prisma.post.create({
      data: {
        ...rest,
        slug,
        status,
        publishedAt,
        authorId: authorId ?? null,
        tags: tags.length
          ? { create: tags.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
          : undefined,
      },
      include: detailInclude,
    });
    return shape(post);
  },

  /**
   * UC-56 — update a post. If `tags` is provided it fully replaces the set.
   * Slug is only regenerated when the caller passes a new explicit slug; the
   * title alone never silently changes an existing slug (SEO/link stability).
   */
  async update(id, data) {
    const existing = await prisma.post.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Post');

    const { tags, slug: rawSlug, ...rest } = data;

    let slug;
    if (rawSlug && rawSlug !== existing.slug) {
      slug = await this._uniqueSlug(rawSlug, Number(id));
    }

    // Promote publishedAt the first time a draft goes PUBLISHED.
    let publishedAt;
    if (
      rest.status === 'PUBLISHED' &&
      existing.status !== 'PUBLISHED' &&
      !existing.publishedAt
    ) {
      publishedAt = new Date();
    }

    const post = await prisma.post.update({
      where: { id: Number(id) },
      data: {
        ...rest,
        ...(slug ? { slug } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(Array.isArray(tags)
          ? {
              tags: {
                deleteMany: {},
                create: tags.map((tagId) => ({ tag: { connect: { id: tagId } } })),
              },
            }
          : {}),
      },
      include: detailInclude,
    });
    return shape(post);
  },

  /** UC-56 — soft delete → status = ARCHIVED (drops it from public lists). */
  async softDelete(id) {
    const existing = await prisma.post.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Post');
    const post = await prisma.post.update({
      where: { id: Number(id) },
      data: { status: 'ARCHIVED' },
      include: detailInclude,
    });
    return shape(post);
  },

  /**
   * Find a free slug: if `base` is taken, append -2, -3, … until unique.
   * `excludeId` lets an update keep its own slug without a false collision.
   */
  async _uniqueSlug(base, excludeId = null) {
    const root = base || 'bai-viet';
    let candidate = root;
    let n = 1;
    while (true) {
      const clash = await prisma.post.findFirst({
        where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
      n += 1;
      candidate = `${root}-${n}`;
    }
  },
};

export default adminPostService;
