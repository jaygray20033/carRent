// Supplier portal controller (Phase C) + supplier-invite accept.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import { supplierPortalService } from './supplierPortal.service.js';
import { adminSupplierService } from '../admin/suppliers/adminSupplier.service.js';

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

  // Invite accept — any authenticated user (not yet a member).
  acceptInvite: asyncHandler(async (req, res) => {
    const member = await adminSupplierService.acceptInvite(req.body, req.user.id);
    return success(res, { member }, 'Đã tham gia nhà cung cấp');
  }),
};

export default supplierPortalController;
