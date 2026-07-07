// src/api/v1/admin/contact-messages/adminContact.controller.js
// Day 36 (UC-29) — admin contact message list + update.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, paginated } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { contactService } from '../../contact/contact.service.js';

export const adminContactController = {
  // GET /admin/contact-messages?status=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await contactService.list({ status: req.query.status, page, size });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // PATCH /admin/contact-messages/:id  body { status, replyNote }
  update: asyncHandler(async (req, res) => {
    const msg = await contactService.update(req.params.id, req.body);
    return success(res, { message: msg }, 'Đã cập nhật liên hệ');
  }),
};

export default adminContactController;
