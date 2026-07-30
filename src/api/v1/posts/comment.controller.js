// src/api/v1/posts/comment.controller.js
// Blog comment controllers (UC-24).
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import { commentService } from './comment.service.js';

export const commentController = {
  // POST /posts/:id/comments (auth) — insert PENDING comment
  create: asyncHandler(async (req, res) => {
    const comment = await commentService.create({
      postId: req.params.id,
      userId: req.user.id,
      content: req.body.content,
    });
    return created(res, { comment }, 'Bình luận đã được gửi và đang chờ duyệt');
  }),

  // GET /posts/:id/comments?page=&size= — public, APPROVED only
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 10);
    const result = await commentService.listApproved({ postId: req.params.id, page, size });
    return success(res, result);
  }),

  // GET /posts/:id/comments/mine (auth) — caller's own comments (any status)
  mine: asyncHandler(async (req, res) => {
    const items = await commentService.listMine({ postId: req.params.id, userId: req.user.id });
    return success(res, { items });
  }),
};

export default commentController;
