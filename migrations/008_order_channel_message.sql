CREATE TABLE IF NOT EXISTS order_channel_message (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    kind TEXT NOT NULL, -- 'address' | 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, kind)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_channel_message_unique ON order_channel_message(order_id, kind);
