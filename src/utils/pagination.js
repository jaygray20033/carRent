// src/utils/pagination.js — §5.1 Pagination utility
// parse ?page=1&size=20&sort=name:asc,createdAt:desc

/**
 * Parse pagination query params.
 * @param {object} query - req.query
 * @param {number} defaultSize - default items per page (default 20)
 * @param {number} maxSize - max items per page (default 100)
 * @returns {{ page: number, size: number, skip: number, sort: object|undefined }}
 */
export const parsePagination = (query, defaultSize = 20, maxSize = 100) => {
  let page = parseInt(query.page, 10);
  let size = parseInt(query.size || query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(size) || size < 1) size = defaultSize;
  if (size > maxSize) size = maxSize;

  // Parse sort param: "name:asc,createdAt:desc"
  let orderBy;
  if (query.sort) {
    orderBy = query.sort.split(',').map((s) => {
      const [field, dir] = s.trim().split(':');
      return { [field]: dir === 'desc' ? 'desc' : 'asc' };
    });
  }

  return { page, size, skip: (page - 1) * size, orderBy };
};

/**
 * Build a standard paginated response payload.
 * @param {Array} items
 * @param {number} total
 * @param {{ page: number, size: number }} pagination
 * @returns {{ items: Array, page: number, size: number, total: number, totalPages: number }}
 */
export const paginatedResponse = (items, total, { page, size }) => ({
  items,
  page,
  size,
  total,
  totalPages: Math.ceil(total / size),
});
