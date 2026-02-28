-- 0 = бот сотрудников, 1 = интернет-магазин
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source SMALLINT NOT NULL DEFAULT 0;
