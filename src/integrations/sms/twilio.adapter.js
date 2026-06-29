// src/integrations/sms/twilio.adapter.js
//
// SMS adapter — Twilio in production, mock (console) mode in development.
//
//   sendSms({ to, message })
//
// When SMS_PROVIDER !== 'twilio' (default 'mock') or Twilio creds are missing,
// the message is logged to the console instead of being sent. This keeps dev/CI
// working without a paid SMS gateway. Swap to eSMS.vn by adding a sibling adapter.
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';

let twilioClient;

/**
 * Lazily build the Twilio client. Returns null when the SDK isn't installed or
 * creds are missing — callers then fall back to mock mode.
 */
async function getTwilioClient() {
  if (twilioClient !== undefined) return twilioClient;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    twilioClient = null;
    return null;
  }
  try {
    const { default: twilio } = await import('twilio');
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    logger.warn(`Twilio SDK unavailable, using mock SMS: ${err.message}`);
    twilioClient = null;
  }
  return twilioClient;
}

/**
 * Send an SMS (or log it in mock mode).
 *
 * @param {Object} opts
 * @param {string} opts.to      - recipient phone (E.164, e.g. +84...)
 * @param {string} opts.message - message body
 * @returns {Promise<{sent: boolean, sid?: string, mock?: boolean}>}
 */
export async function sendSms({ to, message }) {
  if (!to) {
    logger.warn('sendSms skipped: no recipient');
    return { sent: false };
  }

  const useMock = env.SMS_PROVIDER !== 'twilio' || env.NODE_ENV === 'development';
  const client = useMock ? null : await getTwilioClient();

  if (!client) {
    console.log(
      `\n📱 [SMS][mock] -> ${to}\n   ${message}\n   (mock mode — SMS gateway not used)\n`
    );
    logger.info(`SMS (mock) to ${to}`);
    return { sent: false, mock: true };
  }

  const res = await client.messages.create({ to, from: env.TWILIO_FROM, body: message });
  logger.info(`📱 SMS sent to ${to} sid=${res.sid}`);
  return { sent: true, sid: res.sid };
}

export const twilioAdapter = { sendSms };
export default twilioAdapter;
