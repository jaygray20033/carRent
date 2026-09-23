// src/api/v1/admin/settings/adminSettings.controller.js
// Day 35 (UC-60) — admin settings read/write.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success } from '../../../../utils/apiResponse.js';
import { settingsService } from '../../../../services/settingsService.js';

export const adminSettingsController = {
  // GET /admin/settings — full settings map grouped by key.
  getAll: asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    return success(res, data, 'Settings');
  }),

  // PUT /admin/settings — upsert key/value pairs, invalidate the cache.
  update: asyncHandler(async (req, res) => {
    const data = await settingsService.updateMany(req.body.settings);
    return success(res, data, 'Settings updated');
  }),
};

export default adminSettingsController;
