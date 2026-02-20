-- Создание таблицы разделов позиций
CREATE TABLE IF NOT EXISTS section (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address_id INTEGER REFERENCES address(id),
    category_id INTEGER REFERENCES category(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, address_id, category_id)
);

-- Добавление столбца section_id в таблицу item
ALTER TABLE item ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES section(id);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_section_address_category ON section(address_id, category_id);
CREATE INDEX IF NOT EXISTS idx_item_section_id ON item(section_id);
