// src/api/v1/admin/taxonomies/adminTaxonomy.service.js
// Admin blog taxonomy CRUD (UC-56) — post categories + tags. Both are simple
// name/slug entities; slug is auto-derived from name and unique-suffixed.
import prisma from '../../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../../utils/apiError.js';
import { slugify } from '../../../../utils/slug.js';

// Factory: builds a CRUD service over either the postCategory or tag delegate.
// `label` is used for NotFoundError messages; both models share the same shape.
const makeService = (delegate, label) => ({
  async list() {
    const rows = await delegate.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { posts: true } },
      },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, postCount: r._count.posts }));
  },

  async create({ name, slug }) {
    const finalSlug = await this._uniqueSlug(slug || slugify(name));
    await this._assertNameFree(name);
    return delegate.create({
      data: { name: name.trim(), slug: finalSlug },
      select: { id: true, name: true, slug: true },
    });
  },

  async update(id, { name, slug }) {
    const existing = await delegate.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError(label);

    const data = {};
    if (name && name.trim() !== existing.name) {
      await this._assertNameFree(name, Number(id));
      data.name = name.trim();
    }
    if (slug && slug !== existing.slug) {
      data.slug = await this._uniqueSlug(slug, Number(id));
    }
    return delegate.update({
      where: { id: Number(id) },
      data,
      select: { id: true, name: true, slug: true },
    });
  },

  /**
   * Hard delete. The Post↔category FK is ON DELETE SET NULL and PostTag is
   * ON DELETE CASCADE, so removing a taxonomy row just detaches it from posts
   * rather than deleting the posts themselves.
   */
  async remove(id) {
    const existing = await delegate.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError(label);
    await delegate.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  },

  async _assertNameFree(name, excludeId = null) {
    const clash = await delegate.findFirst({
      where: { name: name.trim(), ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictError(`${label} name already exists`, 'DUPLICATE');
  },

  async _uniqueSlug(base, excludeId = null) {
    const root = base || 'muc';
    let candidate = root;
    let n = 1;
     
    while (true) {
      const clash = await delegate.findFirst({
        where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
      n += 1;
      candidate = `${root}-${n}`;
    }
  },
});

export const adminCategoryService = makeService(prisma.postCategory, 'Category');
export const adminTagService = makeService(prisma.tag, 'Tag');
