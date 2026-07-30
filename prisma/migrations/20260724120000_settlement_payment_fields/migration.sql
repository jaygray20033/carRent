-- B2B VietQR/SePay — corporate settlements now carry bank-transfer reconciliation
-- data. A SePay webhook flips SENT/CONFIRMED → PAID by matching the transfer memo
-- to the settlement id, recording when it landed, how, and the bank's txn ref.

-- AlterTable corporate_settlements — add payment reconciliation columns
ALTER TABLE `corporate_settlements`
    ADD COLUMN `paid_at` DATETIME(3) NULL,
    ADD COLUMN `payment_method` VARCHAR(191) NULL,
    ADD COLUMN `payment_txn_ref` VARCHAR(191) NULL;

-- CreateIndex — payment_txn_ref is the webhook idempotency key (one settlement per bank txn)
CREATE UNIQUE INDEX `corporate_settlements_payment_txn_ref_key` ON `corporate_settlements`(`payment_txn_ref`);
