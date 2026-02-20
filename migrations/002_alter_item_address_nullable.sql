-- Make item.address_id nullable to allow ephemeral items per report
ALTER TABLE item ALTER COLUMN address_id DROP NOT NULL;

