// tests/jobsWorkers.test.js — Unit tests for BullMQ worker processors (Day 43.5, Group 1)
//
// Strategy: these are TRUE unit tests. We never boot a real BullMQ Worker or
// touch Redis/MySQL. Instead we mock every dependency the processor imports and
// invoke the exported processor function directly with a fake job object.
//
// Covered:
//   releaseHoldWorker.processReleaseHold — TTL expiry → cancel + history + hold release
//   paymentWorker.processPaymentJob      — refund path, provider-fail throw, unknown job
//   notificationWorker.processNotificationJob + handlers — channel routing
//   viewSyncWorker.processFlushPostViews — delegates to postService.flushViewCounters
//
import { jest } from '@jest/globals';

// ── Mock prisma (shared by release-hold + notification workers) ──────────────
const prismaMock = {
  booking: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  bookingHistory: { create: jest.fn() },
  $transaction: jest.fn(async (cb) => {
    // Emulate an interactive transaction: pass a tx client that reuses the same mocks.
    return cb({
      booking: { update: prismaMock.booking.update },
      bookingHistory: { create: prismaMock.bookingHistory.create },
    });
  }),
};
jest.unstable_mockModule('../src/config/db.js', () => ({
  default: prismaMock,
}));

// ── Mock RedisLockService (release-hold releases the slot) ───────────────────
const releaseHoldMock = jest.fn(async () => true);
jest.unstable_mockModule('../src/services/RedisLockService.js', () => ({
  default: { releaseHold: releaseHoldMock },
}));

// ── Mock the BullMQ Worker so importing the module never opens a connection ──
jest.unstable_mockModule('bullmq', () => ({
  Worker: class {
    constructor() {
      this.on = jest.fn();
    }
    on() {}
  },
  Queue: class {},
}));

// ── Mock the Redis integration (bullConnection is read at import time) ───────
jest.unstable_mockModule('../src/integrations/redis.js', () => ({
  bullConnection: {},
  redis: {},
  default: {},
}));

// ── Mock logger to keep test output clean ────────────────────────────────────
jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Mock env ─────────────────────────────────────────────────────────────────
jest.unstable_mockModule('../src/config/env.js', () => ({
  env: { FRONTEND_URL: 'https://otorent.test', API_PREFIX: '/api/v1' },
}));

// ── Mock email + sms integrations (notification worker) ──────────────────────
const sendEmailMock = jest.fn(async () => ({ ok: true }));
jest.unstable_mockModule('../src/integrations/email.js', () => ({
  sendEmail: sendEmailMock,
  default: { sendEmail: sendEmailMock },
}));
const sendSmsMock = jest.fn(async () => ({ ok: true }));
jest.unstable_mockModule('../src/integrations/sms/twilio.adapter.js', () => ({
  sendSms: sendSmsMock,
  twilioAdapter: { sendSms: sendSmsMock },
  default: { sendSms: sendSmsMock },
}));

// ── Mock booking.service (payment worker refund) ─────────────────────────────
const settleExternalRefundMock = jest.fn(async () => ({ id: 1, status: 'REFUNDED' }));
jest.unstable_mockModule('../src/api/v1/bookings/booking.service.js', () => ({
  bookingService: { settleExternalRefund: settleExternalRefundMock },
  default: { settleExternalRefund: settleExternalRefundMock },
}));

// ── Mock post.service (view-sync worker) ─────────────────────────────────────
const flushViewCountersMock = jest.fn(async () => ({ flushed: 3 }));
jest.unstable_mockModule('../src/api/v1/posts/post.service.js', () => ({
  postService: { flushViewCounters: flushViewCountersMock },
  default: { flushViewCounters: flushViewCountersMock },
}));

// ── Dynamic imports AFTER mocks are registered ───────────────────────────────
const { processReleaseHold } = await import('../src/jobs/releaseHoldWorker.js');
const { processPaymentJob } = await import('../src/jobs/paymentWorker.js');
const { processNotificationJob, handleBookingConfirmed, handleBookingCancelled } = await import(
  '../src/jobs/notificationWorker.js'
);
const { processFlushPostViews } = await import('../src/jobs/viewSyncWorker.js');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
//  releaseHoldWorker
// ─────────────────────────────────────────────────────────────────────────────
describe('releaseHoldWorker.processReleaseHold', () => {
  it('cancels an expired-hold booking, writes history, and releases the Redis hold', async () => {
    prismaMock.booking.findMany.mockResolvedValueOnce([
      {
        id: 42,
        bookingCode: 'OTR-1',
        status: 'PENDING_PAYMENT',
        vehicleId: 7,
        pickupAt: new Date('2026-08-01T10:00:00Z'),
        returnAt: new Date('2026-08-02T10:00:00Z'),
        holdUntil: new Date('2026-07-01T00:00:00Z'),
      },
    ]);

    const result = await processReleaseHold({ name: 'release-hold-job' });

    expect(result).toEqual({ cancelled: 1, total: 1 });
    // Booking flipped to CANCELLED
    expect(prismaMock.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    );
    // A history row records the transition PENDING_PAYMENT -> CANCELLED
    expect(prismaMock.bookingHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: 42,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'CANCELLED',
        }),
      })
    );
    // The vehicle slot hold is released
    expect(releaseHoldMock).toHaveBeenCalledWith(
      7,
      expect.any(Date),
      expect.any(Date),
      42
    );
  });

  it('returns {cancelled:0} and does nothing when no bookings are expired', async () => {
    prismaMock.booking.findMany.mockResolvedValueOnce([]);

    const result = await processReleaseHold({ name: 'release-hold-job' });

    expect(result).toEqual({ cancelled: 0 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(releaseHoldMock).not.toHaveBeenCalled();
  });

  it('keeps processing remaining bookings when one transaction throws (no crash)', async () => {
    prismaMock.booking.findMany.mockResolvedValueOnce([
      { id: 1, bookingCode: 'A', status: 'DRAFT', vehicleId: 1, pickupAt: new Date(), returnAt: new Date(), holdUntil: new Date() },
      { id: 2, bookingCode: 'B', status: 'DRAFT', vehicleId: 2, pickupAt: new Date(), returnAt: new Date(), holdUntil: new Date() },
    ]);
    // First $transaction rejects, second resolves.
    prismaMock.$transaction
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockImplementationOnce(async (cb) =>
        cb({ booking: { update: prismaMock.booking.update }, bookingHistory: { create: prismaMock.bookingHistory.create } })
      );

    const result = await processReleaseHold({ name: 'release-hold-job' });

    // Only the second booking was cancelled; the worker did not throw.
    expect(result).toEqual({ cancelled: 1, total: 2 });
  });

  it('still counts the cancel as done even if releasing the Redis hold fails', async () => {
    prismaMock.booking.findMany.mockResolvedValueOnce([
      { id: 9, bookingCode: 'C', status: 'PENDING_PAYMENT', vehicleId: 3, pickupAt: new Date(), returnAt: new Date(), holdUntil: new Date() },
    ]);
    releaseHoldMock.mockRejectedValueOnce(new Error('redis down'));

    const result = await processReleaseHold({ name: 'release-hold-job' });

    expect(result).toEqual({ cancelled: 1, total: 1 });
    expect(prismaMock.booking.update).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  paymentWorker
// ─────────────────────────────────────────────────────────────────────────────
describe('paymentWorker.processPaymentJob', () => {
  it('process-refund: calls the provider then settles the external refund', async () => {
    const result = await processPaymentJob({
      name: 'process-refund',
      data: { bookingId: 55, paymentId: 88, method: 'VNPAY', amount: 500000, txnRef: 'TXN-1' },
    });

    expect(result).toEqual({ processed: true });
    expect(settleExternalRefundMock).toHaveBeenCalledWith(55, 88, expect.stringContaining('REFUND-VNPAY-'));
  });

  it('verify-payment: is a no-op that resolves with processed:true', async () => {
    const result = await processPaymentJob({ name: 'verify-payment', data: { bookingId: 1 } });
    expect(result).toEqual({ processed: true });
    expect(settleExternalRefundMock).not.toHaveBeenCalled();
  });

  it('payment-timeout: resolves without settling a refund', async () => {
    const result = await processPaymentJob({ name: 'payment-timeout', data: { bookingId: 2 } });
    expect(result).toEqual({ processed: true });
    expect(settleExternalRefundMock).not.toHaveBeenCalled();
  });

  it('unknown job type: resolves processed:true without side effects', async () => {
    const result = await processPaymentJob({ name: 'does-not-exist', data: {} });
    expect(result).toEqual({ processed: true });
    expect(settleExternalRefundMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  notificationWorker
// ─────────────────────────────────────────────────────────────────────────────
describe('notificationWorker', () => {
  it('booking-confirmed via email: looks up booking and sends the confirmation email', async () => {
    prismaMock.booking.findUnique.mockResolvedValueOnce({
      id: 10,
      bookingCode: 'OTR-10',
      totalAmount: 1200000,
      vehicleId: 5,
      pickupAt: new Date('2026-08-01T10:00:00Z'),
      returnAt: new Date('2026-08-03T10:00:00Z'),
      user: { email: 'rider@test.com', phone: '0900000001', fullName: 'Rider' },
      vehicle: { name: 'Vios', brand: { name: 'Toyota' } },
    });

    await handleBookingConfirmed({ bookingId: 10, channels: ['email'] });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        template: 'booking-confirmed',
        data: expect.objectContaining({ bookingCode: 'OTR-10', vehicleName: 'Toyota Vios' }),
      })
    );
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('booking-confirmed via sms: sends an SMS containing the booking code', async () => {
    prismaMock.booking.findUnique.mockResolvedValueOnce({
      id: 11,
      bookingCode: 'OTR-11',
      totalAmount: 500000,
      vehicleId: 6,
      user: { email: 'x@test.com', phone: '0900000002', fullName: 'X' },
      vehicle: { name: 'City', brand: { name: 'Honda' } },
    });

    await handleBookingConfirmed({ bookingId: 11, channels: ['sms'] });

    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '0900000002', message: expect.stringContaining('OTR-11') })
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('booking-confirmed: missing booking → warns and sends nothing', async () => {
    prismaMock.booking.findUnique.mockResolvedValueOnce(null);
    await handleBookingConfirmed({ bookingId: 999, channels: ['email'] });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('booking-cancelled: emails the cancellation notice', async () => {
    prismaMock.booking.findUnique.mockResolvedValueOnce({
      id: 12,
      bookingCode: 'OTR-12',
      totalAmount: 300000,
      user: { email: 'c@test.com', fullName: 'C' },
    });

    await handleBookingCancelled({ bookingId: 12, channels: ['email'] });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@test.com', subject: expect.stringContaining('OTR-12') })
    );
  });

  it('processNotificationJob routes send-email and send-sms passthroughs', async () => {
    await processNotificationJob({ name: 'send-email', data: { to: 'a@b.com', template: 't', data: {} } });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));

    await processNotificationJob({ name: 'send-sms', data: { to: '0900000003', message: 'hi' } });
    expect(sendSmsMock).toHaveBeenCalledWith(expect.objectContaining({ to: '0900000003' }));
  });

  it('processNotificationJob: unknown type resolves processed:true without sending', async () => {
    const result = await processNotificationJob({ name: 'mystery', data: {} });
    expect(result).toEqual({ processed: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  viewSyncWorker
// ─────────────────────────────────────────────────────────────────────────────
describe('viewSyncWorker.processFlushPostViews', () => {
  it('delegates to postService.flushViewCounters and returns its result', async () => {
    const result = await processFlushPostViews({ name: 'flush-post-views-job' });
    expect(flushViewCountersMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ flushed: 3 });
  });
});
