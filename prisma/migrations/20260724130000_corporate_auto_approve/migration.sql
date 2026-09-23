-- B2B — per-company toggle: when true, employee bookings skip corporate-admin
-- approval and are created directly as APPROVED. Admin flips this from the portal.

-- AlterTable corporate_clients
ALTER TABLE `corporate_clients`
    ADD COLUMN `auto_approve_bookings` BOOLEAN NOT NULL DEFAULT false;
