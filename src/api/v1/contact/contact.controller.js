// src/api/v1/contact/contact.controller.js
// Day 36 (UC-28/29/30) — public contact form + public contact settings.
import { asyncHandler } from '../../../middlewares/asyncHandler.js';
import { success, created } from '../../../utils/apiResponse.js';
import { settingsService } from '../../../services/settingsService.js';
import { contactService } from './contact.service.js';

// Which setting keys are exposed publicly at /site-settings/contact, mapped to a
// friendly response shape.
const PUBLIC_CONTACT_KEYS = {
  hotline: 'site_hotline',
  email: 'site_email',
  address: 'site_address',
  hours: 'site_hours',
};
const PUBLIC_SOCIAL_KEYS = {
  facebook: 'site_facebook',
  instagram: 'site_instagram',
  linkedin: 'site_linkedin',
  twitter: 'site_twitter',
};

export const contactController = {
  // POST /contact-messages — public, rate limited.
  submit: asyncHandler(async (req, res) => {
    const msg = await contactService.create(req.body, req.ip);
    return created(res, { id: msg.id }, 'Đã gửi liên hệ. Chúng tôi sẽ phản hồi sớm.');
  }),

  // GET /site-settings/contact — public hotline/email/address/social.
  publicContact: asyncHandler(async (_req, res) => {
    const map = await settingsService.getMap();
    const contact = {};
    for (const [out, key] of Object.entries(PUBLIC_CONTACT_KEYS)) contact[out] = map[key] ?? null;
    const social = {};
    for (const [out, key] of Object.entries(PUBLIC_SOCIAL_KEYS)) social[out] = map[key] ?? null;
    return success(res, { ...contact, social }, 'Contact info');
  }),
};

export default contactController;
