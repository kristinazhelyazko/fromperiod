CREATE TABLE IF NOT EXISTS detail_type (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value_text TEXT,
    value_bool BOOLEAN,
    value_date DATE,
    value_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, key)
);

CREATE INDEX IF NOT EXISTS idx_detail_type_order_id ON detail_type(order_id);
CREATE INDEX IF NOT EXISTS idx_detail_type_key ON detail_type(key);

INSERT INTO detail_type (order_id, key, value_date)
SELECT id, 'execution_date', execution_date FROM orders
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_time)
SELECT id, 'execution_time', execution_time FROM orders
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text)
SELECT order_id, 'client_name', client_name FROM contacts
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text)
SELECT order_id, 'client_phone', client_phone FROM contacts
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text)
SELECT order_id, 'recipient_name', recipient_name FROM contacts
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text)
SELECT order_id, 'recipient_phone', recipient_phone FROM contacts
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text)
SELECT order_id, 'recipient_address', recipient_address FROM contacts
WHERE recipient_address IS NOT NULL
ON CONFLICT (order_id, key) DO NOTHING;

INSERT INTO detail_type (order_id, key, value_text, value_bool)
SELECT d.order_id,
       kv.key,
       CASE 
         WHEN jsonb_typeof(kv.value) IN ('string','number') THEN TRIM('"' FROM kv.value::text)
         WHEN jsonb_typeof(kv.value) IN ('object','array') THEN kv.value::text
         ELSE NULL
       END AS value_text,
       CASE 
         WHEN jsonb_typeof(kv.value) = 'boolean' THEN (kv.value)::boolean
         ELSE NULL
       END AS value_bool
FROM order_details d
     CROSS JOIN LATERAL jsonb_each(d.details) AS kv(key, value)
ON CONFLICT (order_id, key) DO NOTHING;

