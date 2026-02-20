-- Добавление ФИО создателя заказа
ALTER TABLE orders ADD COLUMN IF NOT EXISTS creator_full_name TEXT;

-- Индекс по ФИО при необходимости поиска
CREATE INDEX IF NOT EXISTS idx_orders_creator_full_name ON orders(creator_full_name);

