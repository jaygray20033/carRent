// src/integrations/sms.js — SMS sender (stub)
// Day 3: chưa tích hợp SMS thật → log OTP ra console.
// Cấu trúc như một "job" để sau này thay bằng Twilio/eSMS dễ dàng.
import logger from '../config/logger.js';

/**
 * Enqueue an OTP "send job". Currently logs to console.
 * In production: push to a queue (BullMQ) and a worker calls Twilio/eSMS.
 *
 * @param {Object} job
 * @param {string} job.to        - recipient phone (or email)
 * @param {string} job.code      - plain OTP code (only logged in dev)
 * @param {string} job.purpose   - REGISTER | RESET | CHANGE_PHONE
 * @param {number} job.ttl       - TTL seconds
 */
export const enqueueSendOtp = async ({ to, code, purpose, ttl }) => {
  console.log(
    `\n📲 [OTP][${purpose}] -> ${to}\n` +
      `   code : ${code}\n` +
      `   ttl  : ${ttl}s\n` +
      `   (DEV ONLY — SMS gateway not integrated yet)\n`
  );
  logger.info(`OTP enqueued for ${to} (${purpose})`);
  return { queued: true, to, purpose };
};

export default { enqueueSendOtp };
