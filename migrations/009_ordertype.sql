-- Создание таблицы типов заказа
CREATE TABLE IF NOT EXISTS ordertype (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    called TEXT NOT NULL
);

-- Первичные записи
INSERT INTO ordertype (name, called) VALUES
  ('wedding', 'Свадебный букет'),
  ('composition', 'Композиция'),
  ('food', 'Еда'),
  ('flowers_food', 'Цветы + еда')
ON CONFLICT (name) DO NOTHING;

-- Добавляем ссылку на тип заказа в таблицу orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type_id INTEGER REFERENCES ordertype(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'order_type'
  ) THEN
    UPDATE orders o
    SET order_type_id = ot.id
    FROM ordertype ot
    WHERE LOWER(o.order_type) = LOWER(ot.name)
      AND (o.order_type_id IS NULL OR o.order_type_id <> ot.id);
  END IF;
END
$$;

-- После переноса удаляем старое поле
ALTER TABLE orders DROP COLUMN IF EXISTS order_type;

-- Индекс по типу заказа для ускорения выборок
CREATE INDEX IF NOT EXISTS idx_orders_order_type_id ON orders(order_type_id);

