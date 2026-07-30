-- Marketplace: Suppliers + members, dispatch fields on corporate_bookings, enum values

-- CreateTable suppliers
CREATE TABLE `suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `tax_code` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `contact_name` VARCHAR(191) NULL,
    `contact_phone` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `commission_rate` DOUBLE NOT NULL DEFAULT 0.15,
    `note` TEXT NULL,
    `contract_ref` VARCHAR(191) NULL,
    `contract_start` DATETIME(3) NULL,
    `contract_end` DATETIME(3) NULL,
    `transport_license_no` VARCHAR(191) NULL,
    `critical_violation_count` INTEGER NOT NULL DEFAULT 0,
    `termination_risk` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `suppliers_tax_code_key`(`tax_code`),
    INDEX `suppliers_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable supplier_members
CREATE TABLE `supplier_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `full_name` VARCHAR(191) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `invited_phone` VARCHAR(191) NULL,
    `invited_email` VARCHAR(191) NULL,
    `invite_token` VARCHAR(128) NULL,
    `invite_expires_at` DATETIME(3) NULL,
    `invite_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supplier_members_user_id_key`(`user_id`),
    UNIQUE INDEX `supplier_members_invite_token_key`(`invite_token`),
    INDEX `supplier_members_supplier_id_idx`(`supplier_id`),
    INDEX `supplier_members_invite_token_idx`(`invite_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable corporate_bookings — dispatch fields
ALTER TABLE `corporate_bookings`
    ADD COLUMN `supplier_id` INTEGER NULL,
    ADD COLUMN `supplier_member_id` INTEGER NULL,
    ADD COLUMN `dispatched_at` DATETIME(3) NULL,
    ADD COLUMN `dispatched_by` INTEGER NULL,
    ADD COLUMN `commission_rate` DOUBLE NULL,
    ADD COLUMN `commission_amount` DOUBLE NULL,
    ADD COLUMN `supplier_vehicle_note` TEXT NULL,
    ADD COLUMN `driver_info_released_at` DATETIME(3) NULL,
    ADD COLUMN `driver_info_released_by` INTEGER NULL,
    ADD COLUMN `released_driver_info` TEXT NULL;

-- AlterEnum corporate_bookings.status — add DISPATCHED + DRIVER_ASSIGNED
ALTER TABLE `corporate_bookings`
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'DISPATCHED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'PENDING_CONFIRM', 'CONFIRMED', 'SETTLED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX `corporate_bookings_supplier_id_idx` ON `corporate_bookings`(`supplier_id`);

-- AddForeignKey
ALTER TABLE `supplier_members` ADD CONSTRAINT `supplier_members_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_members` ADD CONSTRAINT `supplier_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_supplier_member_id_fkey` FOREIGN KEY (`supplier_member_id`) REFERENCES `supplier_members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
