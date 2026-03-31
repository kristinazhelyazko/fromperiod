ALTER TABLE catalog_section
  ADD COLUMN IF NOT EXISTS address_id INTEGER REFERENCES address(id);

CREATE INDEX IF NOT EXISTS idx_catalog_section_address_id ON catalog_section(address_id);
