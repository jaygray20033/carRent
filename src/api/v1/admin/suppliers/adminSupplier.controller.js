// Admin supplier + dispatch controllers.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { adminSupplierService } from './adminSupplier.service.js';
import { dispatchService } from './dispatch.service.js';
import { supplierSettlementService } from './supplierSettlement.service.js';

export const adminSupplierController = {
  // ── Supplier CRUD ────────────────────────────────────────────────
  create: asyncHandler(async (req, res) => {
    const supplier = await adminSupplierService.create(req.body);
    return created(res, { supplier }, 'Đã tạo nhà cung cấp');
  }),

  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await adminSupplierService.list({
      q: req.query.q,
      isActive: req.query.isActive,
      page,
      size,
    });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const supplier = await adminSupplierService.getById(req.params.id);
    return success(res, { supplier });
  }),

  update: asyncHandler(async (req, res) => {
    const supplier = await adminSupplierService.update(req.params.id, req.body);
    return success(res, { supplier }, 'Đã cập nhật nhà cung cấp');
  }),

  deactivate: asyncHandler(async (req, res) => {
    const supplier = await adminSupplierService.deactivate(req.params.id);
    return success(res, { supplier }, 'Đã vô hiệu hoá nhà cung cấp');
  }),

  // ── Members ──────────────────────────────────────────────────────
  listMembers: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.listMembers(req.params.id, {});
    return success(res, result);
  }),

  inviteMember: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.inviteMember(req.params.id, req.body);
    return created(
      res,
      { member: result.member, inviteToken: result.inviteToken },
      'Đã gửi lời mời thành viên'
    );
  }),

  updateMember: asyncHandler(async (req, res) => {
    const member = await adminSupplierService.updateMember(
      req.params.id,
      req.params.memberId,
      req.body
    );
    return success(res, { member }, 'Đã cập nhật thành viên');
  }),

  removeMember: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.removeMember(
      req.params.id,
      req.params.memberId
    );
    return success(res, result, 'Đã xoá thành viên');
  }),

  // ── Commission report (Phase D) ──────────────────────────────────
  commissionReport: asyncHandler(async (req, res) => {
    const report = await adminSupplierService.commissionReport(req.params.id, {
      from: req.query.from,
      to: req.query.to,
    });
    return success(res, { report });
  }),

  // ── Dispatch (Phase B) ───────────────────────────────────────────
  dispatch: asyncHandler(async (req, res) => {
    const booking = await dispatchService.dispatch(
      req.params.id,
      req.body,
      req.user.id
    );
    return success(res, { booking }, 'Đã điều phối chuyến cho nhà cung cấp');
  }),

  recall: asyncHandler(async (req, res) => {
    const booking = await dispatchService.recall(req.params.id, req.body, req.user.id);
    return success(res, { booking }, 'Đã thu hồi chuyến');
  }),

  releaseDriverInfo: asyncHandler(async (req, res) => {
    const booking = await dispatchService.releaseDriverInfo(
      req.params.id,
      req.user.id,
      req.body
    );
    return success(res, { booking }, 'Đã chuyển thông tin tài xế cho doanh nghiệp');
  }),

  exportDispatchRecord: asyncHandler(async (req, res) => {
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'pdf') {
      const { buffer, filename } = await dispatchService.exportDispatchRecordPdf(
        req.params.id
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }
    if (format === 'csv') {
      const { body, filename } = await dispatchService.exportDispatchRecordCsv(
        req.params.id
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(body);
    }
    const record = await dispatchService.exportDispatchRecord(req.params.id);
    return success(res, { dispatchRecord: record });
  }),

  // ── Supplier settlement / payout (Phase E) ───────────────────────
  createSettlement: asyncHandler(async (req, res) => {
    const settlement = await supplierSettlementService.create(req.params.id, req.body);
    return created(res, { settlement }, 'Đã tạo kỳ payout');
  }),

  listSettlements: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await supplierSettlementService.listBySupplier(req.params.id, {
      status: req.query.status,
      page,
      size,
    });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  getSettlement: asyncHandler(async (req, res) => {
    const settlement = await supplierSettlementService.getById(
      req.params.settlementId,
      req.params.id
    );
    return success(res, { settlement });
  }),

  verifySettlement: asyncHandler(async (req, res) => {
    await supplierSettlementService.getById(req.params.settlementId, req.params.id);
    const settlement = await supplierSettlementService.verify(
      req.params.settlementId,
      req.user.id
    );
    return success(res, { settlement }, 'Đã xác minh hồ sơ payout');
  }),

  rejectSettlement: asyncHandler(async (req, res) => {
    await supplierSettlementService.getById(req.params.settlementId, req.params.id);
    const settlement = await supplierSettlementService.rejectDocuments(
      req.params.settlementId,
      req.body,
      req.user.id
    );
    return success(res, { settlement }, 'Đã yêu cầu bổ sung hồ sơ');
  }),

  markSettlementPaid: asyncHandler(async (req, res) => {
    await supplierSettlementService.getById(req.params.settlementId, req.params.id);
    const settlement = await supplierSettlementService.markPaid(
      req.params.settlementId,
      req.body,
      req.user.id
    );
    return success(res, { settlement }, 'Đã đánh dấu đã thanh toán');
  }),
};

export default adminSupplierController;
