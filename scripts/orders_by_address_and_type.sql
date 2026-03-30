-- Заказы по адресам и типам заказа
-- Вывод: адрес, тип заказа, полная информация по заказу без фото.
-- Для заказов из интернет-магазина (order_source=1) — название позиции из каталога.
-- Сортировка: по адресу, типу заказа, дате и времени.
--
-- Запуск: psql -U pstock -d pstock -f scripts/orders_by_address_and_type.sql
-- или из папки pstock: node -e "require('dotenv').config(); const pool=require('./config/database'); pool.query(require('fs').readFileSync('scripts/orders_by_address_and_type.sql','utf8')).then(r=>{console.table(r.rows); process.exit(0);}).catch(e=>{console.error(e); process.exit(1);})"
--
-- Если таблицы ordertype нет: замените "COALESCE(ot.called, ot.name, '')" на "''" и уберите "LEFT JOIN ordertype ot".

SELECT
  a.name AS address_name,
  COALESCE(ot.called, ot.name, '') AS order_type_name,
  o.id AS order_id,
  o.number AS order_number,
  o.execution_date,
  o.execution_time,
  o.execution_time_to,
  o.fulfillment_type,
  o.status,
  o.creator_full_name,
  o.cost,
  o.total_cost,
  o.delivery_cost,
  o.total_delivery_cost,
  o.paid_amount,
  o.card_needed_flag,
  o.order_source,
  ps.name AS payment_status_name,
  -- Название позиции: для интернет-магазина из каталога или details, иначе состав/описание
  CASE
    WHEN o.order_source = 1 THEN COALESCE(d.details->>'catalog_item_name', ci.name, '')
    ELSE COALESCE(d.details->>'composition', d.details->>'description', '')
  END AS position_name,
  d.details->>'composition' AS composition,
  d.details->>'description' AS description,
  d.details->>'composition_kind' AS composition_kind,
  d.details->>'card_text' AS card_text,
  d.details->>'comment' AS comment,
  (d.details->>'delivery_cost')::numeric AS details_delivery_cost,
  c.client_name,
  c.client_phone,
  c.recipient_name,
  c.recipient_phone,
  c.recipient_address
FROM orders o
JOIN address a ON a.id = o.address_id
LEFT JOIN ordertype ot ON ot.id = o.order_type_id
LEFT JOIN payment_status ps ON ps.id = o.payment_status_id
LEFT JOIN order_details d ON d.order_id = o.id
LEFT JOIN contacts c ON c.order_id = o.id
LEFT JOIN catalog_item ci ON ci.id = NULLIF(TRIM(COALESCE(d.details->>'catalog_item_id', '')), '')::int
WHERE o.status IS NOT NULL
  AND o.status NOT IN ('cancelled')
ORDER BY a.name,
  COALESCE(ot.called, ot.name, ''),
  o.execution_date,
  o.execution_time,
  o.id;
