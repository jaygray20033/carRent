-- B2B Corporate module (UC-61+)

CREATE TABLE `corporate_clients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `tax_code` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `contact_name` VARCHAR(191) NULL,
    `contact_phone` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `contract_ref` VARCHAR(191) NULL,
    `contract_start` DATETIME(3) NULL,
    `contract_end` DATETIME(3) NULL,
    `credit_limit` DOUBLE NOT NULL DEFAULT 0,
    `payment_term_days` INTEGER NOT NULL DEFAULT 0,
    `price_config` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `corporate_clients_tax_code_key`(`tax_code`),
    INDEX `corporate_clients_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `corporate_employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `employee_code` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `invited_phone` VARCHAR(191) NULL,
    `invited_email` VARCHAR(191) NULL,
    `invite_token` VARCHAR(128) NULL,
    `invite_expires_at` DATETIME(3) NULL,
    `invite_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `corporate_employees_user_id_key`(`user_id`),
    UNIQUE INDEX `corporate_employees_invite_token_key`(`invite_token`),
    INDEX `corporate_employees_corporate_id_idx`(`corporate_id`),
    INDEX `corporate_employees_invite_token_idx`(`invite_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `corporate_bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `vehicle_id` INTEGER NULL,
    `driver_id` INTEGER NULL,
    `purpose` TEXT NULL,
    `pickup_at` DATETIME(3) NOT NULL,
    `return_at` DATETIME(3) NOT NULL,
    `pickup_address` TEXT NOT NULL,
    `dropoff_address` TEXT NOT NULL,
    `estimated_km` INTEGER NULL,
    `status` ENUM('PENDING', 'APPROVED', 'IN_PROGRESS', 'PENDING_CONFIRM', 'CONFIRMED', 'SETTLED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `base_price` DOUBLE NOT NULL,
    `rental_type` VARCHAR(191) NOT NULL,
    `vehicle_type` VARCHAR(191) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `actual_km` INTEGER NULL,
    `employee_note` TEXT NULL,
    `driver_note` TEXT NULL,
    `confirmed_by_employee` BOOLEAN NOT NULL DEFAULT false,
    `confirmed_by_corporate_admin` BOOLEAN NOT NULL DEFAULT false,
    `confirmed_by_otorent` BOOLEAN NOT NULL DEFAULT false,
    `settlement_id` INTEGER NULL,
    `final_amount` DOUBLE NULL,
    `reject_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `corporate_bookings_corporate_id_status_idx`(`corporate_id`, `status`),
    INDEX `corporate_bookings_employee_id_idx`(`employee_id`),
    INDEX `corporate_bookings_settlement_id_idx`(`settlement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trip_expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_booking_id` INTEGER NOT NULL,
    `type` ENUM('TOLL_ROAD', 'PARKING', 'OVERTIME', 'EXTRA_KM', 'ONE_WAY_KM', 'OVERNIGHT', 'OTHER') NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` TEXT NULL,
    `receipt_url` VARCHAR(191) NULL,
    `recorded_by` VARCHAR(191) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approved_by_admin` BOOLEAN NOT NULL DEFAULT false,

    INDEX `trip_expenses_corporate_booking_id_idx`(`corporate_booking_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `corporate_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `corporate_id` INTEGER NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `total_base_amount` DOUBLE NOT NULL,
    `total_expenses` DOUBLE NOT NULL,
    `total_vat` DOUBLE NOT NULL,
    `total_amount` DOUBLE NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'CONFIRMED', 'PAID', 'DISPUTED') NOT NULL DEFAULT 'DRAFT',
    `invoice_ref` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmed_at` DATETIME(3) NULL,

    INDEX `corporate_settlements_corporate_id_status_idx`(`corporate_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `corporate_employees` ADD CONSTRAINT `corporate_employees_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `corporate_employees` ADD CONSTRAINT `corporate_employees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `corporate_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `corporate_settlements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `trip_expenses` ADD CONSTRAINT `trip_expenses_corporate_booking_id_fkey` FOREIGN KEY (`corporate_booking_id`) REFERENCES `corporate_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `corporate_settlements` ADD CONSTRAINT `corporate_settlements_corporate_id_fkey` FOREIGN KEY (`corporate_id`) REFERENCES `corporate_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
