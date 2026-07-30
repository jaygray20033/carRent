// src/integrations/sms/index.js
//
// SMS facade — picks the provider from SMS_PROVIDER and exposes a single
// sendSms({ to, message }) the rest of the app imports. Keeps call sites
// provider-agnostic so swapping eSMS <-> Twilio <-> mock is one env change.
//
//   SMS_PROVIDER=mock    (default) — log to console, never send
//   SMS_PROVIDER=esms              — eSMS.vn brandname (Vietnam)
//   SMS_PROVIDER=twilio            — Twilio
//
// In development every provider is forced to mock so local/E2E runs never spend
// real SMS credits or hit a gateway.
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';
import { sendSms as sendViaEsms } from './esms.adapter.js';
import { sendSms as sendViaTwilio } from './twilio.adapter.js';

function mockSend({ to, message }) {
  console.log(
    `\n📱 [SMS][mock] -> ${to}\n   ${message}\n   (mock mode — SMS gateway not used)\n`
  );
  logger.info(`SMS (mock) to ${to}`);
  return { sent: false, mock: true };
}

/**
 * Send an SMS through the configured provider.
 * @param {{to: string, message: string}} opts
 */
export async function sendSms({ to, message }) {
  if (!to) {
    logger.warn('sendSms skipped: no recipient');
    return { sent: false };
  }

  if (env.NODE_ENV === 'development') return mockSend({ to, message });

  switch (env.SMS_PROVIDER) {
    case 'esms':
      return sendViaEsms({ to, message });
    case 'twilio':
      return sendViaTwilio({ to, message });
    default:
      return mockSend({ to, message });
  }
}

export default { sendSms };
