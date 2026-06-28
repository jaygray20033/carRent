-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ §4.4 — FULLTEXT index for fast auto-complete on vehicle model names    │
-- │                                                                        │
-- │ NOTE: This is a MySQL-only migration. The project now runs on MySQL    │
-- │ 8.0 (see schema.prisma datasource). FULLTEXT is fully supported.        │
-- │ If FULLTEXT is ever unavailable, the search falls back to              │
-- │ LIKE/`contains` automatically (see car.service.js).                    │
-- │                                                                        │
-- │ Apply this manually on the MySQL database AFTER the Prisma             │
-- │ migrations have created the tables:                                    │
-- │   mysql -u <user> -p <db> < 0002_fulltext_vehicle_models.sql           │
-- └──────────────────────────────────────────────────────────────────────┘

-- Auto-complete source: vehicle_models.name + slug
ALTER TABLE `vehicle_models`
  ADD FULLTEXT INDEX `ft_name` (`name`, `slug`);

-- Also index brand names so brand auto-complete is fast
ALTER TABLE `brands`
  ADD FULLTEXT INDEX `ft_brand_name` (`name`, `slug`);

-- Vehicle name search used by GET /cars?q=
ALTER TABLE `vehicles`
  ADD FULLTEXT INDEX `ft_vehicle_name` (`name`, `description`);

-- Example fulltext query the service would use on MySQL:
--   SELECT * FROM vehicle_models
--   WHERE MATCH(name, slug) AGAINST ('camry' IN NATURAL LANGUAGE MODE)
--   LIMIT 8;
