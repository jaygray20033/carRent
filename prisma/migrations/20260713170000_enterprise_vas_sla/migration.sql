-- CreateTable
CREATE TABLE `value_added_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `base_price` DOUBLE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `requires_headcount` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `value_added_services_code_key`(`code`),
    INDEX `value_added_services_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `corporate_vas_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `vas_id` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `note` TEXT NULL,

    INDEX `corporate_vas_prices_corporate_id_idx`(`corporate_id`),
    UNIQUE INDEX `corporate_vas_prices_corporate_id_vas_id_key`(`corporate_id`, `vas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_vas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_booking_id` INTEGER NOT NULL,
    `vas_id` INTEGER NOT NULL,
    `headcount` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DOUBLE NOT NULL,
    `total_price` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `provider_id` INTEGER NULL,
    `confirmed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_vas_corporate_booking_id_idx`(`corporate_booking_id`),
    INDEX `booking_vas_vas_id_idx`(`vas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_slas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `target_value` VARCHAR(191) NULL,
    `penalty_rule` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `contract_slas_corporate_id_idx`(`corporate_id`),
    UNIQUE INDEX `contract_slas_corporate_id_code_key`(`corporate_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sla_violations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_booking_id` INTEGER NOT NULL,
    `sla_id` INTEGER NOT NULL,
    `reported_by` VARCHAR(191) NOT NULL,
    `reported_by_id` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `severity` ENUM('MINOR', 'MAJOR', 'CRITICAL') NOT NULL DEFAULT 'MINOR',
    `evidence_urls` TEXT NULL,
    `is_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `resolution` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sla_violations_corporate_booking_id_idx`(`corporate_booking_id`),
    INDEX `sla_violations_sla_id_idx`(`sla_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_amendments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `amendment_no` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `effective_date` DATETIME(3) NOT NULL,
    `document_url` VARCHAR(191) NULL,
    `signed_by_a` BOOLEAN NOT NULL DEFAULT false,
    `signed_by_b` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contract_amendments_corporate_id_idx`(`corporate_id`),
    UNIQUE INDEX `contract_amendments_corporate_id_amendment_no_key`(`corporate_id`, `amendment_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `corporate_vas_prices` ADD CONSTRAINT `corporate_vas_prices_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `corporate_vas_prices` ADD CONSTRAINT `corporate_vas_prices_vas_id_fkey` FOREIGN KEY (`vas_id`) REFERENCES `value_added_services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_vas` ADD CONSTRAINT `booking_vas_corporate_booking_id_fkey` FOREIGN KEY (`corporate_booking_id`) REFERENCES `corporate_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_vas` ADD CONSTRAINT `booking_vas_vas_id_fkey` FOREIGN KEY (`vas_id`) REFERENCES `value_added_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_slas` ADD CONSTRAINT `contract_slas_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_violations` ADD CONSTRAINT `sla_violations_corporate_booking_id_fkey` FOREIGN KEY (`corporate_booking_id`) REFERENCES `corporate_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_violations` ADD CONSTRAINT `sla_violations_sla_id_fkey` FOREIGN KEY (`sla_id`) REFERENCES `contract_slas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_amendments` ADD CONSTRAINT `contract_amendments_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
