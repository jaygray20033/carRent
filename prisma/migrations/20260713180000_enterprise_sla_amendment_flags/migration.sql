-- AlterTable
ALTER TABLE `corporate_clients` ADD COLUMN `contract_termination_risk` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `contract_amendments` ADD COLUMN `price_config_delta` TEXT NULL,
    ADD COLUMN `applied_at` DATETIME(3) NULL;
