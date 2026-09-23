// ENT-Day 1/2 — VAS + SLA constants

export const VAS_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export const VIOLATION_SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL'];

export const DEFAULT_VAS_CATALOG = [
  {
    code: 'INTERPRETER',
    name: 'Phiên dịch viên',
    unit: 'người/chuyến',
    basePrice: 500000,
    requiresHeadcount: true,
  },
  {
    code: 'SECURITY',
    name: 'Bảo vệ',
    unit: 'người/chuyến',
    basePrice: 800000,
    requiresHeadcount: true,
  },
  {
    code: 'MEDIA_TEAM',
    name: 'Đội truyền thông',
    unit: 'buổi',
    basePrice: 2500000,
    requiresHeadcount: false,
  },
  {
    code: 'ASSISTANT',
    name: 'Trợ lý',
    unit: 'người/chuyến',
    basePrice: 600000,
    requiresHeadcount: true,
  },
  {
    code: 'PHOTOGRAPHER',
    name: 'Nhiếp ảnh/Video',
    unit: 'buổi',
    basePrice: 1500000,
    requiresHeadcount: false,
  },
];

export const DEFAULT_CONTRACT_SLAS = [
  {
    code: 'PUNCTUALITY',
    name: 'Đúng giờ',
    targetValue: '≤ 5 phút trễ',
  },
  {
    code: 'VEHICLE_CONDITION',
    name: 'Chất lượng xe',
    targetValue: 'Sạch sẽ, điều hòa hoạt động',
  },
  {
    code: 'DRIVER_CONDUCT',
    name: 'Thái độ tài xế',
    targetValue: 'Không khiếu nại từ khách',
  },
  {
    code: 'INFO_SECURITY',
    name: 'Bảo mật thông tin',
    targetValue: 'Không rò rỉ thông tin',
  },
];

/** Booking statuses that still accept new VAS lines. */
export const VAS_ADDABLE_BOOKING_STATUSES = new Set(['PENDING', 'APPROVED']);

/** Only PENDING bookings allow deleting a VAS line. */
export const VAS_DELETABLE_BOOKING_STATUSES = new Set(['PENDING']);

export default {
  VAS_STATUSES,
  VIOLATION_SEVERITIES,
  DEFAULT_VAS_CATALOG,
  DEFAULT_CONTRACT_SLAS,
  VAS_ADDABLE_BOOKING_STATUSES,
  VAS_DELETABLE_BOOKING_STATUSES,
};
