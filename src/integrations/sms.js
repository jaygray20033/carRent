// src/integrations/sms.js — OTP sender
// Sends the OTP over SMS (via the configured provider) and, when an email is
// available, also emails it. In development the SMS facade forces mock mode, so
// the code is logged to console + delivered to Mailhog for dev/E2E.
import logger from '../config/logger.js';
import { sendEmail } from './email.js';
import { sendSms } from './sms/index.js';

const OTP_PURPOSE_TEXT = {
  REGISTER: 'dang ky tai khoan',
  RESET: 'dat lai mat khau',
  CHANGE_PHONE: 'doi so dien thoai',
};

/**
 * Enqueue an OTP "send job". Sends the code by SMS through the configured
 * provider (mock in dev; eSMS/Twilio in prod) and, when an email is available,
 * also emails it so it lands in Mailhog during dev/E2E.
 *
 * @param {Object} job
 * @param {string} job.to        - recipient phone
 * @param {string} job.code      - plain OTP code (only logged in dev)
 * @param {string} job.purpose   - REGISTER | RESET | CHANGE_PHONE
 * @param {number} job.ttl       - TTL seconds
 * @param {string} [job.email]   - recipient email (OTP also emailed if present)
 */
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const enqueueSendOtp = async ({ to, code, purpose, ttl, email }) => {
  logger.info(`OTP enqueued for ${to} (${purpose})`);

  // Resolve the email recipient: an explicit `email`, or `to` when it is itself
  // an email address (OTP delivery is email-first in this deployment).
  const emailTo = email || (isEmail(to) ? to : null);

  // Only attempt SMS when `to` is an actual phone number. Best-effort: an SMS
  // gateway failure must never break registration/reset, especially since the
  // OTP is also emailed below when an email recipient is available.
  if (to && !isEmail(to)) {
    try {
      const action = OTP_PURPOSE_TEXT[purpose] || 'xac thuc';
      const ttlMin = Math.round((ttl || 0) / 60);
      await sendSms({
        to,
        message: `CarGoGo: Ma xac thuc ${action} cua ban la ${code}. Hieu luc ${ttlMin} phut. Khong chia se ma nay.`,
      });
    } catch (err) {
      logger.warn(`OTP SMS failed for ${to}: ${err.message}`);
    }
  }

  if (emailTo) {
    // Best-effort: never let email failure break registration.
    try {
      await sendEmail({
        to: emailTo,
        template: 'otp',
        data: { code, purpose, ttlMinutes: Math.round((ttl || 0) / 60) },
      });
    } catch (err) {
      logger.warn(`OTP email failed for ${emailTo}: ${err.message}`);
    }
  }

  return { queued: true, to, purpose };
};

export default { enqueueSendOtp };
