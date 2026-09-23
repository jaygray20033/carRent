-- Add applies_to scope to coupons (UC-57 admin coupon CRUD).
-- ALL = every booking, CATEGORY = vehicle category scoped, MODEL = vehicle model scoped.
ALTER TABLE `coupons`
  ADD COLUMN `applies_to` VARCHAR(191) NOT NULL DEFAULT 'ALL' AFTER `end_at`;
