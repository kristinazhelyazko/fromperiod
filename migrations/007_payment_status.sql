CREATE TABLE IF NOT EXISTS payment_status (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

INSERT INTO payment_status (name) VALUES 
  ('Оплачен полностью'),
  ('Оплачен частично'),
  ('Не оплачен')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status_id INTEGER REFERENCES payment_status(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_id ON orders(payment_status_id);
