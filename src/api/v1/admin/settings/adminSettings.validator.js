// src/api/v1/admin/settings/adminSettings.validator.js
// Day 35 (UC-60) — validation for the settings PUT.
import { z } from 'zod';

// PUT /admin/settings — a flat object of key → value pairs. Keys are the
// SiteSetting.key strings; values are stored as text (numbers are stringified).
// At least one key is required. Values accept string | number | boolean | null.
export const updateSettingsSchema = z
  .object({
    settings: z
      .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .refine((obj) => Object.keys(obj).length > 0, {
        message: 'Cần ít nhất một cấu hình để cập nhật',
      }),
  })
  .strict();

export default { updateSettingsSchema };
