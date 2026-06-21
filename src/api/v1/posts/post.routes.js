// src/api/v1/posts/post.routes.js
import { Router } from 'express';
import prisma from '../../../config/db.js';
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination, paginatedResponse } from '../../../utils/pagination.js';

const router = Router();

/**
 * GET /posts?page=1&size=3 — list published posts
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, size, skip } = parsePagination(req.query, 10);

    const where = { status: 'PUBLISHED' };

    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: size,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          thumbnailUrl: true,
          publishedAt: true,
          viewCount: true,
        },
      }),
      prisma.post.count({ where }),
    ]);

    return success(res, paginatedResponse(items, total, { page, size }));
  })
);

export default router;
