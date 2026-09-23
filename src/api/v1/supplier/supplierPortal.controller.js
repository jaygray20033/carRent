// Supplier portal controller (Phase C) + supplier-invite accept.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import { supplierPortalService } from './supplierPortal.service.js';
import { adminSupplierService } from '../admin/suppliers/adminSupplier.service.js';
import { supplierSettlementService } from '../admin/suppliers/supplierSettlement.service.js';

export const supplierPortalController = {
  me: asyncHandler(async (req, res) => {
    const data = await supplierPortalService.getMe(req.supplierMembership);
    return success(res, data);
  }),

  listBookings: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await supplierPortalService.listBookings(req.supplierMembership, {
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

  getBooking: asyncHandler(async (req, res) => {
    const booking = await supplierPortalService.getBooking(
      req.supplierMembership,
      req.params.id
    );
    return success(res, { booking });
  }),

  assignDriver: asyncHandler(async (req, res) => {
    const booking = await supplierPortalService.assignDriver(
      req.supplierMembership,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã phân công tài xế');
  }),

  reject: asyncHandler(async (req, res) => {
    const booking = await supplierPortalService.reject(
      req.supplierMembership,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã từ chối chuyến');
  }),

  start: asyncHandler(async (req, res) => {
    const booking = await supplierPortalService.startTrip(
      req.supplierMembership,
      req.params.id
    );
    return success(res, { booking }, 'Chuyến đã bắt đầu');
  }),

  complete: asyncHandler(async (req, res) => {
    const booking = await supplierPortalService.complete(
      req.supplierMembership,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã hoàn thành chuyến');
  }),

  costSummary: asyncHandler(async (req, res) => {
    const summary = await supplierPortalService.costSummary(
      req.supplierMembership,
      req.params.id
    );
    return success(res, { summary });
  }),

  // ── Trip expenses (driver logs tolls, parking, overtime…) ──────────
  listExpenses: asyncHandler(async (req, res) => {
    const result = await supplierPortalService.listExpenses(
      req.supplierMembership,
      req.params.id
    );
    return success(res, result);
  }),

  addExpense: asyncHandler(async (req, res) => {
    const result = await supplierPortalService.addExpense(
      req.supplierMembership,
      req.params.id,
      req.body
    );
    return created(res, result, 'Đã ghi chi phí');
  }),

  deleteExpense: asyncHandler(async (req, res) => {
    const result = await supplierPortalService.deleteExpense(
      req.supplierMembership,
      req.params.id,
      req.params.expenseId
    );
    return success(res, result, 'Đã xoá chi phí');
  }),

  // Members (Supplier Admin manages own drivers)
  listMembers: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.listMembers(
      req.supplierMembership.supplierId,
      {}
    );
    return success(res, result);
  }),

  inviteMember: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.inviteMember(
      req.supplierMembership.supplierId,
      req.body
    );
    return created(
      res,
      { member: result.member, inviteToken: result.inviteToken },
      'Đã gửi lời mời thành viên'
    );
  }),

  updateMember: asyncHandler(async (req, res) => {
    const member = await adminSupplierService.updateMember(
      req.supplierMembership.supplierId,
      req.params.memberId,
      req.body
    );
    return success(res, { member }, 'Đã cập nhật thành viên');
  }),

  resendMemberInvite: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.resendInvite(
      req.supplierMembership.supplierId,
      req.params.memberId
    );
    return success(
      res,
      { member: result.member, inviteToken: result.inviteToken },
      'Đã gửi lại lời mời'
    );
  }),

  removeMember: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.removeMember(
      req.supplierMembership.supplierId,
      req.params.memberId
    );
    return success(res, result, 'Đã thu hồi thành viên');
  }),

  // ── Payout settlements (Supplier submits documents) ──────────────
  listSettlements: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await supplierSettlementService.listBySupplier(
      req.supplierMembership.supplierId,
      { status: req.query.status, page, size }
    );
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  getSettlement: asyncHandler(async (req, res) => {
    const settlement = await supplierSettlementService.getById(
      req.params.settlementId,
      req.supplierMembership.supplierId
    );
    return success(res, { settlement });
  }),

  submitSettlementDocuments: asyncHandler(async (req, res) => {
    const settlement = await supplierSettlementService.submitDocuments(
      req.supplierMembership,
      req.params.settlementId,
      req.body
    );
    return success(res, { settlement }, 'Đã nộp hồ sơ payout');
  }),

  // Invite accept — any authenticated user (not yet a member).
  acceptInvite: asyncHandler(async (req, res) => {
    const member = await adminSupplierService.acceptInvite(req.body, req.user.id);
    return success(res, { member }, 'Đã tham gia nhà cung cấp');
  }),

  // ── Shareable multi-use join link ──────────────────────────────────
  createInviteLink: asyncHandler(async (req, res) => {
    const link = await adminSupplierService.createInviteLink(
      req.supplierMembership.supplierId,
      req.body,
      req.user.id
    );
    return created(res, { link }, 'Đã tạo link mời');
  }),

  listInviteLinks: asyncHandler(async (req, res) => {
    const links = await adminSupplierService.listInviteLinks(
      req.supplierMembership.supplierId
    );
    return success(res, { links });
  }),

  revokeInviteLink: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.revokeInviteLink(
      req.supplierMembership.supplierId,
      req.params.linkId
    );
    return success(res, result, 'Đã thu hồi link mời');
  }),

  previewInviteLink: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.previewInviteLink(req.params.token);
    return success(res, result);
  }),

  joinViaLink: asyncHandler(async (req, res) => {
    const result = await adminSupplierService.joinViaLink(req.body.token, req.user.id);
    return success(res, result, 'Đã tham gia nhà cung cấp');
  }),
};

export default supplierPortalController;
