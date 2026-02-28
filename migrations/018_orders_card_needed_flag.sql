-- Флаг «нужна открытка»: 1 = чекбокс установлен, 2 = не установлен
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS card_needed_flag SMALLINT NOT NULL DEFAULT 2;
