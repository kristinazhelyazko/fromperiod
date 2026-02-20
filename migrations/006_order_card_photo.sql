CREATE TABLE IF NOT EXISTS order_card_photo (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_card_photo_order_id ON order_card_photo(order_id);

