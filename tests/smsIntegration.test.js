// tests/smsIntegration.test.js — Unit tests for the SMS integration layer (Day 43.5)
//
// Covers:
//   src/integrations/sms.js            — enqueueSendOtp (console OTP + optional email)
//   src/integrations/sms/twilio.adapter.js — sendSms mock path + missing-recipient guard
//
// Strategy: pure unit tests. Mock email + logger; never call a real SMS gateway.
// Twilio is not installed in this project, so the adapter always falls through
// to mock mode when SMS_PROVIDER !== 'twilio' (the default).
//
import { jest } from '@jest/globals';

const sendEmailMock = jest.fn(async () => ({ ok: true }));
jest.unstable_mockModule('../src/integrations/email.js', () => ({
  sendEmail: sendEmailMock,
  default: { sendEmail: sendEmailMock },
}));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: loggerMock,
}));

// Force mock mode regardless of .env (adapter falls back when SMS_PROVIDER !== 'twilio'
// OR NODE_ENV === 'development'). Keep NODE_ENV=test so the first branch is exercised.
jest.unstable_mockModule('../src/config/env.js', () => ({
  env: {
    SMS_PROVIDER: 'mock',
    NODE_ENV: 'test',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_FROM: '',
  },
}));

const { enqueueSendOtp } = await import('../src/integrations/sms.js');
const { sendSms } = await import('../src/integrations/sms/twilio.adapter.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enqueueSendOtp (src/integrations/sms.js)', () => {
  it('returns {queued:true} and logs the OTP for a valid phone', async () => {
    const result = await enqueueSendOtp({
      to: '0901234567',
      code: '123456',
      purpose: 'REGISTER',
      ttl: 300,
    });

    expect(result).toEqual({ queued: true, to: '0901234567', purpose: 'REGISTER' });
    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('0901234567'));
    // No email provided → sendEmail must not be called.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('also emails the OTP when an email is provided', async () => {
    await enqueueSendOtp({
      to: '0901234567',
      code: '654321',
      purpose: 'RESET',
      ttl: 600,
      email: 'user@example.com',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        template: 'otp',
        data: expect.objectContaining({ code: '654321', purpose: 'RESET', ttlMinutes: 10 }),
      })
    );
  });

  it('does not throw when the email send fails (best-effort)', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      enqueueSendOtp({
        to: '0901234567',
        code: '111111',
        purpose: 'REGISTER',
        ttl: 300,
        email: 'fail@example.com',
      })
    ).resolves.toEqual({ queued: true, to: '0901234567', purpose: 'REGISTER' });

    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('OTP email failed'));
  });
});

describe('sendSms (src/integrations/sms/twilio.adapter.js)', () => {
  it('returns {sent:false} and does not throw when recipient is missing', async () => {
    const result = await sendSms({ to: '', message: 'hello' });
    expect(result).toEqual({ sent: false });
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('no recipient'));
  });

  it('returns {sent:false, mock:true} in mock mode for a valid number', async () => {
    const result = await sendSms({ to: '0901234567', message: 'OtoRent OTP: 123456' });
    expect(result).toEqual({ sent: false, mock: true });
    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('0901234567'));
  });

  it('returns {sent:false} for a null/undefined recipient without calling Twilio', async () => {
    const result = await sendSms({ to: null, message: 'x' });
    expect(result).toEqual({ sent: false });
  });
});
