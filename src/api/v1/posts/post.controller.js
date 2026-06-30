// src/api/v1/posts/post.controller.js
// Blog public read controllers (UC-21/22/25/26/27).
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import { postService } from './post.service.js';

export const postController = {
  // GET /posts?page=&size=&category=&tag=&q=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 10);
    const { category, tag, q } = req.query;
    const result = await postService.list({ page, size, category, tag, q });
    return success(res, result);
  }),

  // GET /posts/featured?limit=
  featured: asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 3, 12);
    const items = await postService.featured(limit);
    return success(res, { items });
  }),

  // GET /posts/search?q=&page=&size=
  search: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 10);
    const result = await postService.search({ q: req.query.q, page, size });
    return success(res, result);
  }),

  // GET /posts/:slug
  detail: asyncHandler(async (req, res) => {
    const post = await postService.detailBySlug(req.params.slug);
    return success(res, { post });
  }),

  // GET /posts/:id/related
  related: asyncHandler(async (req, res) => {
    const items = await postService.related(req.params.id);
    return success(res, { items });
  }),
};

export default postController;
