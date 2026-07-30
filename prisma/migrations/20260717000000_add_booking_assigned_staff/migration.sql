-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `assigned_staff_id` INTEGER NULL,
    ADD COLUMN `assigned_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `bookings_assigned_staff_id_idx` ON `bookings`(`assigned_staff_id`);

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_assigned_staff_id_fkey` FOREIGN KEY (`assigned_staff_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
