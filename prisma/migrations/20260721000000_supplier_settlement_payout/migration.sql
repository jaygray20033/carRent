-- Marketplace Phase E — Supplier payout settlements (mirror of corporate_settlements,
-- money direction OtoRent → Supplier). Payout gated on supplier submitting VAT invoice
-- + bảng kê + lệnh điều xe (HĐ CCDV Điều 2).

-- CreateTable supplier_settlements
CREATE TABLE `supplier_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` INTEGER NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `total_final_amount` DOUBLE NOT NULL,
    `total_commission_amount` DOUBLE NOT NULL,
    `supplier_payout` DOUBLE NOT NULL,
    `status` ENUM('PENDING_DOCUMENTS', 'DOCUMENTS_SUBMITTED', 'DOCUMENTS_REJECTED', 'VERIFIED', 'PAID') NOT NULL DEFAULT 'PENDING_DOCUMENTS',
    `vat_invoice_ref` VARCHAR(191) NULL,
    `vat_invoice_url` TEXT NULL,
    `statement_url` TEXT NULL,
    `dispatch_records_url` TEXT NULL,
    `supporting_documents_url` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `payment_reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `verified_by` INTEGER NULL,
    `paid_at` DATETIME(3) NULL,
    `paid_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `supplier_settlements_supplier_id_status_idx`(`supplier_id`, `status`),
    INDEX `supplier_settlements_period_start_period_end_idx`(`period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable corporate_bookings — link to supplier settlement
ALTER TABLE `corporate_bookings`
    ADD COLUMN `supplier_settlement_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `corporate_bookings_supplier_settlement_id_idx` ON `corporate_bookings`(`supplier_settlement_id`);

-- AddForeignKey
ALTER TABLE `supplier_settlements` ADD CONSTRAINT `supplier_settlements_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `corporate_bookings` ADD CONSTRAINT `corporate_bookings_supplier_settlement_id_fkey` FOREIGN KEY (`supplier_settlement_id`) REFERENCES `supplier_settlements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
