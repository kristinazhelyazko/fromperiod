-- Seed for developer role, test order type and test store
INSERT INTO rights (name) VALUES ('разработчик') ON CONFLICT (name) DO NOTHING;

INSERT INTO address (name) VALUES ('Тестовый магазин') ON CONFLICT (name) DO NOTHING;

INSERT INTO ordertype (name, called) VALUES ('test', 'Тестовый заказ')
ON CONFLICT (name) DO NOTHING;
