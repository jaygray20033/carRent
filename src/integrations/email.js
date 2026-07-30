// src/integrations/email.js
//
// Email integration — SMTP via nodemailer + Handlebars templates.
//
//   sendEmail({ to, template, data, subject? })
//     → render templates/email/<template>.hbs inside layout.hbs and send.
//
// When MAIL_HOST is empty the transport falls back to logging the rendered
// HTML to the console, so dev/CI (and Mailhog setups) work without real creds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'email');

// Default subjects per template (overridable via the `subject` option).
const SUBJECTS = {
  'booking-confirmed': 'Đặt xe thành công — CarGoGo',
  'payment-success': 'Thanh toán thành công — CarGoGo',
  'password-reset': 'Đặt lại mật khẩu — CarGoGo',
  otp: 'Mã xác thực CarGoGo',
};

const compiledCache = new Map();

function compileTemplate(name) {
  if (compiledCache.has(name)) return compiledCache.get(name);
  const file = path.join(TEMPLATE_DIR, `${name}.hbs`);
  const src = fs.readFileSync(file, 'utf8');
  const tpl = Handlebars.compile(src);
  compiledCache.set(name, tpl);
  return tpl;
}

function renderHtml(template, data, subject) {
  const layout = compileTemplate('layout');
  const body = compileTemplate(template)(data);
  return layout({ subject, body });
}

let cachedTransport;
function getTransport() {
  if (cachedTransport !== undefined) return cachedTransport;
  if (!env.MAIL_HOST) {
    cachedTransport = null; // console fallback
    return cachedTransport;
  }
  cachedTransport = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE, // true for 465, false for 587/STARTTLS
    auth: env.MAIL_USER ? { user: env.MAIL_USER, pass: env.MAIL_PASS } : undefined,
  });
  return cachedTransport;
}

/**
 * Render and send an email.
 *
 * @param {Object} opts
 * @param {string} opts.to        - recipient email address
 * @param {string} opts.template  - template name (booking-confirmed | payment-success | password-reset | otp)
 * @param {Object} [opts.data]    - data passed to the Handlebars template
 * @param {string} [opts.subject] - override subject line
 * @param {Array}  [opts.attachments] - nodemailer attachments [{ filename, content, contentType }]
 * @returns {Promise<{sent: boolean, messageId?: string, attachments?: number}>}
 */
export async function sendEmail({ to, template, data = {}, subject, attachments }) {
  if (!to) {
    logger.warn(`sendEmail skipped: no recipient (template=${template})`);
    return { sent: false };
  }
  const resolvedSubject = subject || SUBJECTS[template] || 'CarGoGo';
  const html = renderHtml(template, { ...data, subject: resolvedSubject }, resolvedSubject);
  const transport = getTransport();
  const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;

  if (!transport) {
    logger.info(
      `📧 [EMAIL][console] to=${to} subject="${resolvedSubject}" template=${template} attachments=${attachmentCount} (MAIL_HOST not set — not sent)`
    );
    return { sent: false, console: true, attachments: attachmentCount };
  }

  const info = await transport.sendMail({
    from: env.MAIL_FROM || `${env.MAIL_FROM_NAME} <${env.MAIL_USER}>`,
    to,
    subject: resolvedSubject,
    html,
    attachments: attachmentCount ? attachments : undefined,
  });
  logger.info(`📧 Email sent to ${to} (${template}) messageId=${info.messageId}`);
  return { sent: true, messageId: info.messageId, attachments: attachmentCount };
}

export default { sendEmail };
