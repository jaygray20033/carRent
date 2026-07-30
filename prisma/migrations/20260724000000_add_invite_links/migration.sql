-- Shareable multi-use join links (Slack-style). Distinct from the per-person
-- single-use invite tokens on corporate_employees / supplier_members. One link
-- is shared with many people; each accept creates an ACTIVE member row
-- immediately. max_uses NULL = unlimited; expires_at NULL = never expires.

-- CreateTable corporate_invite_links
CREATE TABLE `corporate_invite_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `default_is_admin` BOOLEAN NOT NULL DEFAULT false,
    `max_uses` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `corporate_invite_links_token_key`(`token`),
    INDEX `corporate_invite_links_corporate_id_idx`(`corporate_id`),
    INDEX `corporate_invite_links_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable supplier_invite_links
CREATE TABLE `supplier_invite_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` INTEGER NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `default_is_admin` BOOLEAN NOT NULL DEFAULT false,
    `max_uses` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supplier_invite_links_token_key`(`token`),
    INDEX `supplier_invite_links_supplier_id_idx`(`supplier_id`),
    INDEX `supplier_invite_links_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `corporate_invite_links` ADD CONSTRAINT `corporate_invite_links_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_invite_links` ADD CONSTRAINT `supplier_invite_links_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
