CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    fulfillment_type VARCHAR(20) NOT NULL, -- pickup | delivery
    address_id INTEGER NOT NULL REFERENCES address(id),
    execution_date DATE NOT NULL,
    execution_time TIME NOT NULL,
    order_type VARCHAR(30) NOT NULL, -- wedding | composition | food | flowers_food | other
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | active | completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, execution_date);
CREATE INDEX IF NOT EXISTS idx_orders_address ON orders(address_id);

CREATE TABLE IF NOT EXISTS order_details (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_details_order_id ON order_details(order_id);

CREATE TABLE IF NOT EXISTS order_photos (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_photos_order_id ON order_photos(order_id);

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    recipient_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_order_id ON contacts(order_id);

CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    trigger_type VARCHAR(10) NOT NULL, -- 7d | 1d | 0d
    scheduled_date DATE NOT NULL,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_date ON reminders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(sent);

