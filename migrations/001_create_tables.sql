-- Создание таблицы прав доступа
CREATE TABLE IF NOT EXISTS rights (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Вставка начальных данных для прав
INSERT INTO rights (name) VALUES ('сотрудник'), ('администратор')
ON CONFLICT (name) DO NOTHING;

-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rights_id INTEGER NOT NULL REFERENCES rights(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индекса для быстрого поиска по логину
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);

-- Создание таблицы адресов магазинов
CREATE TABLE IF NOT EXISTS address (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вставка начальных данных для адресов
INSERT INTO address (name) VALUES ('Белгород'), ('Северный'), ('Строитель')
ON CONFLICT (name) DO NOTHING;

-- Создание таблицы категорий товаров
CREATE TABLE IF NOT EXISTS category (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address_id INTEGER NOT NULL REFERENCES address(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, address_id)
);

-- Создание индекса для фильтрации категорий по адресу
CREATE INDEX IF NOT EXISTS idx_category_address_id ON category(address_id);

-- Вставка начальных данных для категорий (пример для каждого адреса)
-- Бар, цветы, кухня, цех для каждого адреса
INSERT INTO category (name, address_id) 
SELECT cat.name, addr.id 
FROM (VALUES ('бар'), ('цветы'), ('кухня'), ('цех')) AS cat(name)
CROSS JOIN address AS addr
ON CONFLICT (name, address_id) DO NOTHING;

-- Создание таблицы позиций товаров
CREATE TABLE IF NOT EXISTS item (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES category(id),
    address_id INTEGER NOT NULL REFERENCES address(id),
    expected INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание составного индекса для быстрого поиска позиций
CREATE INDEX IF NOT EXISTS idx_item_address_category ON item(address_id, category_id);
CREATE INDEX IF NOT EXISTS idx_item_address_id ON item(address_id);

-- Создание таблицы отчетов пересчета
CREATE TABLE IF NOT EXISTS stockreport (
    id SERIAL PRIMARY KEY,
    address_id INTEGER NOT NULL REFERENCES address(id),
    category_id INTEGER NOT NULL REFERENCES category(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address_id, category_id, date)
);

-- Создание индекса для проверки дубликатов отчетов
CREATE INDEX IF NOT EXISTS idx_stockreport_address_category_date ON stockreport(address_id, category_id, date);

-- Создание таблицы записей пересчета
CREATE TABLE IF NOT EXISTS stock (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES item(id),
    address_id INTEGER NOT NULL REFERENCES address(id),
    stockreport_id INTEGER NOT NULL REFERENCES stockreport(id),
    qty INTEGER DEFAULT 0,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индекса для быстрого обновления записей пересчета
CREATE INDEX IF NOT EXISTS idx_stock_stockreport_id ON stock(stockreport_id);
CREATE INDEX IF NOT EXISTS idx_stock_item_id ON stock(item_id);

-- Создание таблицы привозов
CREATE TABLE IF NOT EXISTS replenish (
    id SERIAL PRIMARY KEY,
    address_id INTEGER NOT NULL REFERENCES address(id),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы позиций привоза
CREATE TABLE IF NOT EXISTS replenishstock (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES item(id),
    replenish_id INTEGER NOT NULL REFERENCES replenish(id),
    qty INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индекса для обновления позиций привоза
CREATE INDEX IF NOT EXISTS idx_replenishstock_replenish_id ON replenishstock(replenish_id);
CREATE INDEX IF NOT EXISTS idx_replenishstock_item_id ON replenishstock(item_id);


