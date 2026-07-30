// src/api/v1/sos-requests/sosRequest.controller.js
// Day 39 (UC-34/35/36) — roadside SOS requests.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';
import { parsePagination } from '../../../utils/pagination.js';
import storage from '../../../integrations/storage.js';
import { sosRequestService } from './sosRequest.service.js';

// Role codes that may view any request and operate the dispatch queue.
const STAFF_ROLES = ['ADMIN', 'OPERATOR'];
const isStaff = (req) => STAFF_ROLES.includes(req.user?.role?.code);

export const sosRequestController = {
  // POST /sos-requests — Customer raises an SOS (optional photos, field "images").
  submit: asyncHandler(async (req, res) => {
    let photos = [];
    if (req.files && req.files.length) {
      const uploaded = await storage.uploadMany(req.files, { folder: `sos/${req.user.id}` });
      photos = uploaded.map((u) => u.url);
    }
    const { lat, lng, bookingId, issueType, description } = req.body;
    const sos = await sosRequestService.create(req.user.id, {
      bookingId,
      latitude: lat,
      longitude: lng,
      issueType,
      description,
      photos,
    });
    return created(res, { sosRequest: sos }, 'Đã gửi yêu cầu cứu hộ. Đội ngũ sẽ liên hệ ngay.');
  }),

  // GET /sos-requests?bookingId= — Customer polls the requests for their booking.
  listForBooking: asyncHandler(async (req, res) => {
    const items = await sosRequestService.listForBooking(req.user.id, req.query.bookingId);
    return success(res, { items });
  }),

  // GET /sos-requests/:id — owner or staff detail.
  detail: asyncHandler(async (req, res) => {
    const sos = await sosRequestService.getById(req.params.id, {
      userId: req.user.id,
      isStaff: isStaff(req),
    });
    return success(res, { sosRequest: sos });
  }),

  // GET /admin/sos-requests?status=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await sosRequestService.list({ status: req.query.status, page, size });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // PATCH /admin/sos-requests/:id — operator advances the status.
  review: asyncHandler(async (req, res) => {
    const body = { ...req.body };
    // Validator takes an ETA in minutes-from-now; the service stores an absolute time.
    if (body.etaMinutes !== undefined) {
      body.estimatedArrival = new Date(Date.now() + body.etaMinutes * 60 * 1000).toISOString();
      delete body.etaMinutes;
    }
    const sos = await sosRequestService.review(req.params.id, body, req.user.id);
    return success(res, { sosRequest: sos }, 'Đã cập nhật yêu cầu cứu hộ');
  }),

  // POST /admin/sos-requests/:id/replacement — operator arranges a replacement car.
  replacement: asyncHandler(async (req, res) => {
    const booking = await sosRequestService.createReplacement(req.params.id, req.body, req.user.id);
    return created(res, { booking }, 'Đã tạo xe thay thế');
  }),
};

export default sosRequestController;
