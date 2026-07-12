// src/integrations/sms.js — SMS sender (stub)
// Day 3: chưa tích hợp SMS thật → log OTP ra console.
// Cấu trúc như một "job" để sau này thay bằng Twilio/eSMS dễ dàng.
import logger from '../config/logger.js';
import { sendEmail } from './email.js';

/**
 * Enqueue an OTP "send job". Logs to console (SMS gateway not integrated) and,
 * when an email is available, also sends the OTP by email so it lands in
 * Mailhog during dev/E2E (Day 43 reads the OTP from the Mailhog API).
 *
 * In production: push to a queue (BullMQ) and a worker calls Twilio/eSMS.
 *
 * @param {Object} job
 * @param {string} job.to        - recipient phone
 * @param {string} job.code      - plain OTP code (only logged in dev)
 * @param {string} job.purpose   - REGISTER | RESET | CHANGE_PHONE
 * @param {number} job.ttl       - TTL seconds
 * @param {string} [job.email]   - recipient email (OTP also emailed if present)
 */
export const enqueueSendOtp = async ({ to, code, purpose, ttl, email }) => {
  console.log(
    `\n📲 [OTP][${purpose}] -> ${to}\n` +
      `   code : ${code}\n` +
      `   ttl  : ${ttl}s\n` +
      `   (DEV ONLY — SMS gateway not integrated yet)\n`
  );
  logger.info(`OTP enqueued for ${to} (${purpose})`);

  if (email) {
    // Best-effort: never let email failure break registration.
    try {
      await sendEmail({
        to: email,
        template: 'otp',
        data: { code, purpose, ttlMinutes: Math.round((ttl || 0) / 60) },
      });
    } catch (err) {
      logger.warn(`OTP email failed for ${email}: ${err.message}`);
    }
  }

  return { queued: true, to, purpose };
};

export default { enqueueSendOtp };
