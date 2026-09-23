-- CreateTable
CREATE TABLE `agent_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `applicant_type` VARCHAR(191) NOT NULL DEFAULT 'INDIVIDUAL',
    `business_name` VARCHAR(191) NOT NULL,
    `tax_code` VARCHAR(191) NULL,
    `address` TEXT NOT NULL,
    `expected_vehicle_count` INTEGER NOT NULL DEFAULT 1,
    `note` TEXT NULL,
    `kyc_file_url` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewed_by` INTEGER NULL,
    `review_note` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `agent_applications_user_id_idx`(`user_id`),
    INDEX `agent_applications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sos_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `issue_type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `photos` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REQUESTED',
    `rescue_station_id` INTEGER NULL,
    `distance_km` DOUBLE NULL,
    `estimated_arrival` DATETIME(3) NULL,
    `driver_name` VARCHAR(191) NULL,
    `driver_phone` VARCHAR(191) NULL,
    `resolution_note` TEXT NULL,
    `replacement_booking_id` INTEGER NULL,
    `handled_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sos_requests_status_idx`(`status`),
    INDEX `sos_requests_user_id_idx`(`user_id`),
    INDEX `sos_requests_booking_id_idx`(`booking_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agent_applications` ADD CONSTRAINT `agent_applications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sos_requests` ADD CONSTRAINT `sos_requests_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sos_requests` ADD CONSTRAINT `sos_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sos_requests` ADD CONSTRAINT `sos_requests_rescue_station_id_fkey` FOREIGN KEY (`rescue_station_id`) REFERENCES `rescue_stations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sos_requests` ADD CONSTRAINT `sos_requests_replacement_booking_id_fkey` FOREIGN KEY (`replacement_booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
