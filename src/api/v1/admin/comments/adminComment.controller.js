// src/api/v1/admin/comments/adminComment.controller.js
// Admin comment moderation controllers (UC-24).
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { adminCommentService } from './adminComment.service.js';

export const adminCommentController = {
  // GET /admin/comments?status=PENDING&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await adminCommentService.list({
      status: req.query.status ?? 'PENDING',
      page,
      size,
    });
    return success(res, result);
  }),

  // PATCH /admin/comments/:id — body { status: APPROVED|REJECTED }
  moderate: asyncHandler(async (req, res) => {
    const comment = await adminCommentService.moderate({
      id: req.params.id,
      status: req.body.status,
    });
    return success(res, { comment }, 'Cập nhật trạng thái bình luận thành công');
  }),
};

export default adminCommentController;
