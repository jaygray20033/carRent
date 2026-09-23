// src/integrations/sms/esms.adapter.js
//
// eSMS.vn SMS adapter — sends OTP/CSKH brandname messages via the eSMS REST API.
//
//   sendSms({ to, message })
//
// Uses the CSKH/OTP endpoint (SmsType = "2"), which is the correct type for
// transactional OTP brandname traffic in Vietnam. Falls back to mock (console)
// mode when creds are missing so dev/CI keeps working without hitting eSMS.
//
// Docs: https://developers.esms.vn/esms-api/ham-gui-tin/tin-nhan-sms-otp-cskh
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';

const ESMS_URL = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

// SmsType "2" = CSKH (customer-care / OTP brandname). This is what eSMS requires
// for transactional OTP so it isn't treated as advertising.
const SMS_TYPE_CSKH = '2';

// eSMS CodeResult values worth naming (full list on their "Mã lỗi" page).
const ESMS_CODE = {
  SUCCESS: '100',
  AUTH_FAILED: '101',
  BRANDNAME_NOT_EXIST: '104',
  DUPLICATE_REQUEST: '124',
  TEMPLATE_NOT_REGISTERED: '146',
};

const ESMS_ERROR_TEXT = {
  [ESMS_CODE.AUTH_FAILED]: 'Sai ApiKey/SecretKey (Authorize Failed)',
  [ESMS_CODE.BRANDNAME_NOT_EXIST]: 'Brandname sai hoặc chưa kích hoạt',
  [ESMS_CODE.DUPLICATE_REQUEST]: 'RequestId đã tồn tại (trùng trong 24h)',
  [ESMS_CODE.TEMPLATE_NOT_REGISTERED]: 'Sai/chưa đăng ký template Brandname CSKH',
};

/**
 * Normalise a Vietnamese phone number to eSMS's expected local form.
 * eSMS expects domestic numbers like "0901234567" (NOT E.164). Convert any
 * +84.../84... input back to a leading 0 so the gateway accepts it.
 *
 *   +84901234567 -> 0901234567
 *   84901234567  -> 0901234567
 *   0901234567   -> 0901234567 (unchanged)
 */
export function toLocalVN(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('84')) return `0${digits.slice(2)}`;
  if (digits.startsWith('0')) return digits;
  return digits;
}

/**
 * Does the sms message contain Vietnamese diacritics? eSMS needs IsUnicode="1"
 * for accented content, "0" for plain ASCII (which costs less / is more
 * reliable). OTP bodies are ASCII so this is usually "0".
 */
function hasUnicode(text) {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(text);
}

/**
 * Send an SMS via eSMS.vn (or log it in mock mode when creds are missing).
 *
 * @param {Object} opts
 * @param {string} opts.to      - recipient phone (local or E.164; normalised here)
 * @param {string} opts.message - message body
 * @returns {Promise<{sent: boolean, sid?: string, mock?: boolean, code?: string}>}
 */
export async function sendSms({ to, message }) {
  if (!to) {
    logger.warn('sendSms skipped: no recipient');
    return { sent: false };
  }

  const credsMissing = !env.ESMS_API_KEY || !env.ESMS_SECRET_KEY;
  if (credsMissing) {
    console.log(
      `\n📱 [SMS][esms:mock] -> ${to}\n   ${message}\n   (mock mode — ESMS_API_KEY/ESMS_SECRET_KEY not set)\n`
    );
    logger.info(`SMS (esms mock) to ${to}`);
    return { sent: false, mock: true };
  }

  const phone = toLocalVN(to);
  const body = {
    ApiKey: env.ESMS_API_KEY,
    SecretKey: env.ESMS_SECRET_KEY,
    Brandname: env.ESMS_BRANDNAME,
    Content: message,
    Phone: phone,
    SmsType: SMS_TYPE_CSKH,
    IsUnicode: hasUnicode(message) ? '1' : '0',
    Sandbox: env.ESMS_SANDBOX ? '1' : '0',
  };

  let res;
  try {
    const resp = await fetch(ESMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    res = await resp.json();
  } catch (err) {
    logger.error(`eSMS request failed for ${phone}: ${err.message}`);
    return { sent: false, error: err.message };
  }

  const code = String(res?.CodeResult ?? '');
  if (code !== ESMS_CODE.SUCCESS) {
    const hint = ESMS_ERROR_TEXT[code] || res?.ErrorMessage || res?.ErorMessage || 'lỗi không xác định';
    logger.error(`eSMS send to ${phone} failed: CodeResult=${code} (${hint})`);
    return { sent: false, code, error: hint };
  }

  // CodeResult=100 only confirms eSMS accepted the request, not final delivery.
  // Delivery status would come via a CallbackUrl, which we don't wire here.
  logger.info(`📱 SMS sent via eSMS to ${phone} sid=${res?.SMSID ?? '—'}`);
  return { sent: true, sid: res?.SMSID, code };
}

export const esmsAdapter = { sendSms };
export default esmsAdapter;
