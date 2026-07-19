// src/api/v1/corporate/corporate.controller.js
// B2B Day 2–4 — Corporate Client, Employee, Booking, Expense controllers.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import { ValidationError, ForbiddenError, UnprocessableError } from '../../../utils/apiError.js';
import storage from '../../../integrations/storage.js';
import { corporateClientService } from './corporateClient.service.js';
import { corporateEmployeeService } from './corporateEmployee.service.js';
import { corporateBookingService } from './corporateBooking.service.js';
import { tripExpenseService } from './tripExpense.service.js';
import { settlementService } from './settlement.service.js';
import { corporateDashboardService } from './corporateDashboard.service.js';
import { vasService } from './vas.service.js';
import { slaService } from './sla.service.js';
import { amendmentService } from './amendment.service.js';

export const corporateController = {
  // ── Admin: Corporate Clients ─────────────────────────────────────

  createClient: asyncHandler(async (req, res) => {
    const client = await corporateClientService.create(req.body);
    return created(res, { client }, 'Đã tạo corporate client');
  }),

  listClients: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await corporateClientService.list({
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

  getClient: asyncHandler(async (req, res) => {
    const client = await corporateClientService.getById(req.params.id);
    return success(res, { client });
  }),

  updateClient: asyncHandler(async (req, res) => {
    const client = await corporateClientService.update(req.params.id, req.body);
    return success(res, { client }, 'Đã cập nhật corporate client');
  }),

  deleteClient: asyncHandler(async (req, res) => {
    const client = await corporateClientService.remove(req.params.id);
    return success(res, { client }, 'Đã vô hiệu hoá corporate client');
  }),

  getPriceConfig: asyncHandler(async (req, res) => {
    const priceConfig = await corporateClientService.getPriceConfig(req.params.id);
    return success(res, { priceConfig });
  }),

  updatePriceConfig: asyncHandler(async (req, res) => {
    const client = await corporateClientService.updatePriceConfig(
      req.params.id,
      req.body.priceConfig
    );
    return success(res, { client }, 'Đã cập nhật bảng giá');
  }),

  // ── Corporate portal ─────────────────────────────────────────────

  myCompany: asyncHandler(async (req, res) => {
    const result = await corporateEmployeeService.getMyCompany(req.user.id);
    return success(res, result);
  }),

  myPriceConfig: asyncHandler(async (req, res) => {
    const priceConfig = await corporateBookingService.getPriceConfigForMembership(
      req.corporateEmployee
    );
    return success(res, { priceConfig });
  }),

  listEmployees: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await corporateEmployeeService.listEmployees(req.corporate.id, {
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

  inviteEmployee: asyncHandler(async (req, res) => {
    const result = await corporateEmployeeService.invite(
      req.corporate.id,
      req.body,
      req.user.id
    );
    return created(
      res,
      {
        employee: result.employee,
        inviteToken: result.inviteToken,
      },
      'Đã gửi lời mời nhân viên'
    );
  }),

  acceptInvite: asyncHandler(async (req, res) => {
    const employee = await corporateEmployeeService.acceptInvite(req.body, req.user.id);
    return success(res, { employee }, 'Đã tham gia công ty');
  }),

  updateEmployee: asyncHandler(async (req, res) => {
    const employee = await corporateEmployeeService.updateEmployee(
      req.corporate.id,
      req.params.id,
      req.body
    );
    return success(res, { employee }, 'Đã cập nhật nhân viên');
  }),

  removeEmployee: asyncHandler(async (req, res) => {
    const result = await corporateEmployeeService.removeEmployee(
      req.corporate.id,
      req.params.id
    );
    return success(res, result, 'Đã xoá nhân viên khỏi công ty');
  }),

  // ── Bookings (Day 3) ─────────────────────────────────────────────

  createBooking: asyncHandler(async (req, res) => {
    const booking = await corporateBookingService.create(req.corporateEmployee, req.body);
    return created(res, { booking }, 'Đã gửi yêu cầu đặt xe, chờ duyệt');
  }),

  listBookings: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await corporateBookingService.list(req.corporateEmployee, {
      status: req.query.status,
      employeeId: req.query.employeeId,
      month: req.query.month,
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
    const booking = await corporateBookingService.getById(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { booking });
  }),

  approveBooking: asyncHandler(async (req, res) => {
    const booking = await corporateBookingService.approve(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã duyệt yêu cầu đặt xe');
  }),

  rejectBooking: asyncHandler(async (req, res) => {
    const booking = await corporateBookingService.reject(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã từ chối yêu cầu đặt xe');
  }),

  cancelBooking: asyncHandler(async (req, res) => {
    const booking = await corporateBookingService.cancel(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { booking }, 'Đã huỷ chuyến');
  }),

  startBooking: asyncHandler(async (req, res) => {
    // OtoRent Admin advances APPROVED → IN_PROGRESS
    const booking = await corporateBookingService.startTrip(req.params.id);
    return success(res, { booking }, 'Chuyến đã bắt đầu');
  }),

  // UC-72 — admin list all B2B bookings
  adminListBookings: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await corporateBookingService.adminList({
      corporateId: req.query.corporateId,
      status: req.query.status,
      driverId: req.query.driverId,
      supplierId: req.query.supplierId,
      awaitingDriverRelease: req.query.awaitingDriverRelease,
      from: req.query.from,
      to: req.query.to,
      page,
      size,
    });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // UC-72 — assign driver + optional vehicle
  assignDriver: asyncHandler(async (req, res) => {
    const booking = await corporateBookingService.assignDriver(req.params.id, req.body);
    return success(res, { booking }, 'Đã phân công tài xế');
  }),

  // ── Expenses + confirm (Day 4) ───────────────────────────────────

  addExpense: asyncHandler(async (req, res) => {
    const expense = await tripExpenseService.addExpense(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return created(res, { expense }, 'Đã ghi nhận chi phí');
  }),

  listExpenses: asyncHandler(async (req, res) => {
    const result = await tripExpenseService.listExpenses(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, result);
  }),

  deleteExpense: asyncHandler(async (req, res) => {
    const result = await tripExpenseService.deleteExpense(
      req.corporateEmployee,
      req.params.id,
      req.params.expenseId
    );
    return success(res, result, 'Đã xoá chi phí');
  }),

  approveExpense: asyncHandler(async (req, res) => {
    const expense = await tripExpenseService.approveExpense(
      req.corporateEmployee,
      req.params.id,
      req.params.expenseId,
      req.body
    );
    return success(res, { expense }, 'Đã cập nhật duyệt chi phí');
  }),

  uploadReceipt: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError([{ field: 'image', message: 'Vui lòng chọn ảnh biên lai' }]);
    }
    // Access check (IDOR guard) before storing.
    await tripExpenseService.attachReceipt(
      req.corporateEmployee,
      req.params.id,
      'pending'
    );
    const { url } = await storage.upload(req.file, {
      folder: `corporate/receipts/${req.params.id}`,
    });
    return success(res, { receiptUrl: url }, 'Đã upload biên lai');
  }),

  completeBooking: asyncHandler(async (req, res) => {
    const booking = await tripExpenseService.complete(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return success(res, { booking }, 'Đã xác nhận hoàn thành chuyến');
  }),

  confirmEmployee: asyncHandler(async (req, res) => {
    const booking = await tripExpenseService.confirmEmployee(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { booking }, 'Nhân viên đã xác nhận chi phí');
  }),

  confirmCorporate: asyncHandler(async (req, res) => {
    const booking = await tripExpenseService.confirmCorporate(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { booking }, 'Corporate Admin đã xác nhận');
  }),

  confirmOtorent: asyncHandler(async (req, res) => {
    const booking = await tripExpenseService.confirmOtorent(req.params.id);
    return success(res, { booking }, 'OtoRent đã xác nhận cuối');
  }),

  costSummary: asyncHandler(async (req, res) => {
    const summary = await tripExpenseService.costSummary(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { summary });
  }),

  // ── Settlements (Day 5) ──────────────────────────────────────────

  createSettlement: asyncHandler(async (req, res) => {
    const settlement = await settlementService.create(req.params.id, req.body);
    return created(res, { settlement }, 'Đã tạo kỳ quyết toán');
  }),

  listSettlementsAdmin: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await settlementService.listByCorporate(req.params.id, {
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
    const settlement = await settlementService.getById(req.params.id);
    return success(res, { settlement });
  }),

  sendSettlement: asyncHandler(async (req, res) => {
    const result = await settlementService.send(req.params.id);
    return success(res, result, 'Đã gửi bảng kê cho doanh nghiệp');
  }),

  markSettlementPaid: asyncHandler(async (req, res) => {
    const settlement = await settlementService.markPaid(req.params.id, req.body);
    return success(res, { settlement }, 'Đã đánh dấu thanh toán');
  }),

  exportSettlementPdf: asyncHandler(async (req, res) => {
    const { pdf, settlement } = await settlementService.exportPdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="settlement-${settlement.id}.pdf"`
    );
    return res.send(pdf);
  }),

  listSettlementsCorporate: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await settlementService.listByCorporate(req.corporate.id, {
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

  getSettlementCorporate: asyncHandler(async (req, res) => {
    const settlement = await settlementService.getById(req.params.id);
    if (settlement.corporateId !== req.corporate.id) {
      throw new ForbiddenError('Settlement không thuộc công ty của bạn');
    }
    return success(res, { settlement });
  }),

  confirmSettlement: asyncHandler(async (req, res) => {
    const settlement = await settlementService.confirmByCorporate(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { settlement }, 'Đã xác nhận bảng kê');
  }),

  disputeSettlement: asyncHandler(async (req, res) => {
    const settlement = await settlementService.disputeByCorporate(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return success(res, { settlement }, 'Đã gửi dispute');
  }),

  // ── Dashboard & reports (Day 6) ──────────────────────────────────

  corporateDashboard: asyncHandler(async (req, res) => {
    corporateDashboardService.assertAdmin(req.corporateEmployee);
    const data = await corporateDashboardService.getDashboard(req.corporate.id, {
      month: req.query.month,
    });
    return success(res, data);
  }),

  corporateTripsReport: asyncHandler(async (req, res) => {
    corporateDashboardService.assertAdmin(req.corporateEmployee);
    const { body, filename } = await corporateDashboardService.exportTripsCsv(
      req.corporate.id,
      {
        month: req.query.month,
        employeeId: req.query.employeeId,
        status: req.query.status,
      }
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(body);
  }),

  adminCompanyDashboard: asyncHandler(async (req, res) => {
    const data = await corporateDashboardService.getDashboard(req.params.id, {
      month: req.query.month,
    });
    return success(res, data);
  }),

  // ── ENT-Day 2: Value-Added Services ────────────────────────────────

  listActiveVas: asyncHandler(async (_req, res) => {
    const items = await vasService.listActiveCatalog();
    return success(res, { items });
  }),

  myVasPricing: asyncHandler(async (req, res) => {
    const items = await vasService.listMyVasPricing(req.corporateEmployee);
    return success(res, { items });
  }),

  createVas: asyncHandler(async (req, res) => {
    const vas = await vasService.createVas(req.body);
    return created(res, { vas }, 'Đã tạo VAS');
  }),

  updateVas: asyncHandler(async (req, res) => {
    const vas = await vasService.updateVas(req.params.id, req.body);
    return success(res, { vas }, 'Đã cập nhật VAS');
  }),

  setCorporateVasPricing: asyncHandler(async (req, res) => {
    const prices = await vasService.setCorporateVasPricing(req.params.id, req.body);
    return success(res, { prices }, 'Đã cập nhật bảng giá VAS');
  }),

  addBookingVas: asyncHandler(async (req, res) => {
    const line = await vasService.addBookingVas(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return created(res, { bookingVas: line }, 'Đã thêm VAS vào chuyến');
  }),

  removeBookingVas: asyncHandler(async (req, res) => {
    const result = await vasService.removeBookingVas(
      req.corporateEmployee,
      req.params.id,
      req.params.vasId
    );
    return success(res, result, 'Đã xoá VAS');
  }),

  assignBookingVas: asyncHandler(async (req, res) => {
    const bookingVas = await vasService.assignProvider(
      req.params.id,
      req.params.vasId,
      req.body
    );
    return success(res, { bookingVas }, 'Đã assign người thực hiện VAS');
  }),

  // ── ENT-Day 3: SLA ────────────────────────────────────────────────

  createSla: asyncHandler(async (req, res) => {
    const sla = await slaService.createSla(req.params.id, req.body);
    return created(res, { sla }, 'Đã tạo SLA');
  }),

  listSla: asyncHandler(async (req, res) => {
    const items = await slaService.listSla(req.params.id);
    return success(res, { items });
  }),

  listMySla: asyncHandler(async (req, res) => {
    const result = await slaService.listMySla(req.corporateEmployee);
    return success(res, result);
  }),

  updateSla: asyncHandler(async (req, res) => {
    const sla = await slaService.updateSla(req.params.id, req.params.slaId, req.body);
    return success(res, { sla }, 'Đã cập nhật SLA');
  }),

  reportSlaViolation: asyncHandler(async (req, res) => {
    const violation = await slaService.reportViolation(
      req.corporateEmployee,
      req.params.id,
      req.body
    );
    return created(res, { violation }, 'Đã báo cáo vi phạm SLA');
  }),

  listBookingSlaViolations: asyncHandler(async (req, res) => {
    const items = await slaService.listBookingViolations(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { items });
  }),

  confirmSlaViolation: asyncHandler(async (req, res) => {
    const result = await slaService.confirmViolation(req.params.id, req.body);
    return success(res, result, 'Đã xác nhận vi phạm SLA');
  }),

  adminListSlaViolations: asyncHandler(async (req, res) => {
    const result = await slaService.adminListViolations(req.query);
    return success(res, result);
  }),

  getSlaReport: asyncHandler(async (req, res) => {
    const report = await slaService.getSlaReport(req.params.id);
    return success(res, { report });
  }),

  // ── ENT-Day 3: Amendments ─────────────────────────────────────────

  createAmendment: asyncHandler(async (req, res) => {
    const amendment = await amendmentService.create(req.params.id, req.body);
    return created(res, { amendment }, 'Đã tạo phụ lục HĐ');
  }),

  listAmendmentsAdmin: asyncHandler(async (req, res) => {
    const items = await amendmentService.listByCorporate(req.params.id);
    return success(res, { items });
  }),

  listMyAmendments: asyncHandler(async (req, res) => {
    const items = await amendmentService.listMine(req.corporateEmployee);
    return success(res, { items });
  }),

  uploadAmendment: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError([{ field: 'file', message: 'Vui lòng chọn file PDF' }]);
    }
    if (req.file.mimetype !== 'application/pdf') {
      // 415 Unsupported Media Type mapped via Unprocessable for consistency with upload middleware,
      // but tests expect 415 — throw AppError-like via status on Unprocessable is 422; use raw.
      const err = new UnprocessableError('Chỉ chấp nhận file PDF', 'UNSUPPORTED_MEDIA');
      err.statusCode = 415;
      throw err;
    }
    const { url } = await storage.upload(req.file, {
      folder: `corporate/amendments/${req.params.id}`,
    });
    const amendment = await amendmentService.uploadDocument(
      req.params.id,
      req.params.amendmentId,
      url
    );
    return success(res, { amendment, documentUrl: url }, 'Đã upload PDF phụ lục');
  }),

  signAmendmentB: asyncHandler(async (req, res) => {
    const amendment = await amendmentService.signB(req.params.id, req.params.amendmentId);
    return success(res, { amendment }, 'Bên B đã ký phụ lục');
  }),

  signAmendmentA: asyncHandler(async (req, res) => {
    const amendment = await amendmentService.signA(
      req.corporateEmployee,
      req.params.id
    );
    return success(res, { amendment }, 'Bên A đã ký phụ lục');
  }),
};

export default corporateController;
