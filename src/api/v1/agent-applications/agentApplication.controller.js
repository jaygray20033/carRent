// src/api/v1/agent-applications/agentApplication.controller.js
// Day 38 (UC-32/33) — agent (car owner) applications.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import storage from '../../../integrations/storage.js';
import { agentApplicationService } from './agentApplication.service.js';

export const agentApplicationController = {
  // POST /agent-applications — authenticated user submits (optional KYC file "image").
  submit: asyncHandler(async (req, res) => {
    let kycFileUrl = null;
    if (req.file) {
      const { url } = await storage.upload(req.file, { folder: `kyc/${req.user.id}` });
      kycFileUrl = url;
    }
    const application = await agentApplicationService.create(req.user.id, req.body, kycFileUrl);
    return created(res, { application }, 'Đã gửi đơn đăng ký đối tác. Chúng tôi sẽ liên hệ sớm.');
  }),

  // GET /me/agent-application — user views their latest application.
  mine: asyncHandler(async (req, res) => {
    const application = await agentApplicationService.getMine(req.user.id);
    return success(res, { application });
  }),

  // GET /admin/agent-applications?status=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await agentApplicationService.list({ status: req.query.status, page, size });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // GET /admin/agent-applications/:id
  detail: asyncHandler(async (req, res) => {
    const application = await agentApplicationService.getById(req.params.id);
    return success(res, { application });
  }),

  // PATCH /admin/agent-applications/:id — approve/reject.
  review: asyncHandler(async (req, res) => {
    const application = await agentApplicationService.review(req.params.id, req.body, req.user.id);
    return success(
      res,
      { application },
      req.body.status === 'APPROVED' ? 'Đã duyệt đơn đăng ký' : 'Đã từ chối đơn đăng ký'
    );
  }),
};

export default agentApplicationController;
