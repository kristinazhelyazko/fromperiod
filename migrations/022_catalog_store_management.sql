CREATE TABLE IF NOT EXISTS catalog_section (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

ALTER TABLE catalog_item
  ADD COLUMN IF NOT EXISTS address_id INTEGER NOT NULL DEFAULT 0;

ALTER TABLE catalog_item
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES catalog_section(id);

ALTER TABLE catalog_item
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_catalog_item_address_id ON catalog_item(address_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_section_id ON catalog_item(section_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_created_by_user_id ON catalog_item(created_by_user_id);

UPDATE catalog_item
SET address_id = 0
WHERE address_id IS NULL;
