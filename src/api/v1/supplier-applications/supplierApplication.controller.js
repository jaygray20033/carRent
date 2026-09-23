// Supplier (nhà xe) partner applications — public submission + admin review.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import storage from '../../../integrations/storage.js';
import { supplierApplicationService } from './supplierApplication.service.js';

export const supplierApplicationController = {
  // POST /supplier-applications — authenticated user submits (optional license file "image").
  submit: asyncHandler(async (req, res) => {
    let licenseFileUrl = null;
    if (req.file) {
      const { url } = await storage.upload(req.file, { folder: `supplier-kyc/${req.user.id}` });
      licenseFileUrl = url;
    }
    const application = await supplierApplicationService.create(req.user.id, req.body, licenseFileUrl);
    return created(
      res,
      { application },
      'Đã gửi hồ sơ đối tác nhà xe. Chúng tôi sẽ xét duyệt và liên hệ sớm.'
    );
  }),

  // GET /me/supplier-application — user views their latest application.
  mine: asyncHandler(async (req, res) => {
    const application = await supplierApplicationService.getMine(req.user.id);
    return success(res, { application });
  }),

  // GET /admin/supplier-applications?status=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await supplierApplicationService.list({ status: req.query.status, page, size });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // GET /admin/supplier-applications/:id
  detail: asyncHandler(async (req, res) => {
    const application = await supplierApplicationService.getById(req.params.id);
    return success(res, { application });
  }),

  // PATCH /admin/supplier-applications/:id — approve/reject.
  review: asyncHandler(async (req, res) => {
    const application = await supplierApplicationService.review(req.params.id, req.body, req.user.id);
    return success(
      res,
      { application },
      req.body.status === 'APPROVED' ? 'Đã duyệt hồ sơ nhà xe' : 'Đã từ chối hồ sơ'
    );
  }),
};

export default supplierApplicationController;
