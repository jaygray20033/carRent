-- Day 21 (UC-21/22/25/26/27) — Blog: categories, tags, post fields + FULLTEXT

-- New columns on posts
ALTER TABLE `posts`
  ADD COLUMN `category_id` INTEGER NULL,
  ADD COLUMN `is_featured` BOOLEAN NOT NULL DEFAULT false;

-- Post categories
CREATE TABLE `post_categories` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `post_categories_name_key`(`name`),
  UNIQUE INDEX `post_categories_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tags
CREATE TABLE `tags` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tags_name_key`(`name`),
  UNIQUE INDEX `tags_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Post ↔ Tag join
CREATE TABLE `post_tags` (
  `post_id` INTEGER NOT NULL,
  `tag_id` INTEGER NOT NULL,
  INDEX `post_tags_tag_id_idx`(`tag_id`),
  PRIMARY KEY (`post_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes on posts
CREATE INDEX `posts_status_published_at_idx` ON `posts`(`status`, `published_at`);
CREATE INDEX `posts_category_id_idx` ON `posts`(`category_id`);

-- FULLTEXT index for search (UC-27)
CREATE FULLTEXT INDEX `posts_title_content_ftx` ON `posts`(`title`, `content`);

-- Foreign keys
ALTER TABLE `posts`
  ADD CONSTRAINT `posts_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `post_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `post_tags`
  ADD CONSTRAINT `post_tags_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `post_tags`
  ADD CONSTRAINT `post_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
