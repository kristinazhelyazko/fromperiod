SELECT setval(
  pg_get_serial_sequence('catalog_item', 'id'),
  (SELECT COALESCE(MAX(id), 0) FROM catalog_item)
);
