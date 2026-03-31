CREATE TABLE IF NOT EXISTS catalog_item_photo (
    id SERIAL PRIMARY KEY,
    catalog_item_id INTEGER NOT NULL REFERENCES catalog_item(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_photo_item_id ON catalog_item_photo(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_photo_sort ON catalog_item_photo(catalog_item_id, sort_order);
