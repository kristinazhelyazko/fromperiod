const XLSX = require('xlsx');
const path = require('path');

function escape(s) {
  return String(s).replace(/'/g, "''");
}

function readPairs(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const pairs = [];
  for (const r of rows) {
    const section = (r[0] ?? '').toString().trim();
    const item = (r[1] ?? '').toString().trim();
    if (!section && !item) continue;
    pairs.push({ section, item });
  }
  return pairs;
}

function normalizeData(pairs) {
  // Deduplicate sections (case-insensitive), trim
  const sectionSet = new Map();
  for (const p of pairs) {
    const raw = (p.section || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!sectionSet.has(key)) sectionSet.set(key, raw);
  }
  const sections = Array.from(sectionSet.values()).sort((a, b) => a.localeCompare(b, 'ru'));
  // Build items list with possible null sections; dedup by (item, section) case-insensitive
  const itemSet = new Set();
  const items = [];
  for (const p of pairs) {
    const item = (p.item || '').trim();
    const section = (p.section || '').trim() || null;
    if (!item) continue;
    const key = `${item.toLowerCase()}|${(section || '').toLowerCase()}`;
    if (itemSet.has(key)) continue;
    itemSet.add(key);
    items.push({ item, section });
  }
  // Sort by section then item (NULL sections last)
  items.sort((x, y) => {
    const sx = x.section || 'Я__NULL__Я';
    const sy = y.section || 'Я__NULL__Я';
    const c = sx.localeCompare(sy, 'ru');
    return c !== 0 ? c : x.item.localeCompare(y.item, 'ru');
  });
  return { sections, items };
}

function buildSql(sections, items, addresses = ['Северный', 'Строитель'], category = 'бар') {
  const addrEsc = addresses.map(a => `'${escape(a)}'`).join(',');
  const addrList = `(${addrEsc})`;
  const sectionValues = sections.map(s => `('${escape(s)}')`).join(',\n  ');
  const itemValues = items.map(i => `('${escape(i.item)}', ${i.section ? `'${escape(i.section)}'` : 'NULL'})`).join(',\n    ');
  const sqlSections = sections.length ? `
WITH cats AS (
  SELECT c.id AS category_id, c.address_id
  FROM category c
  JOIN address a ON a.id = c.address_id
  WHERE LOWER(c.name) = '${escape(category.toLowerCase())}' AND a.name IN ${addrList}
)
INSERT INTO section (name, address_id, category_id)
SELECT v.name, cats.address_id, cats.category_id
FROM (VALUES
  ${sectionValues}
) AS v(name)
CROSS JOIN cats
ON CONFLICT (name, address_id, category_id) DO NOTHING;`.trim() : '';

  const sqlItems = items.length ? `
WITH cats AS (
  SELECT c.id AS category_id, c.address_id
  FROM category c
  JOIN address a ON a.id = c.address_id
  WHERE LOWER(c.name) = '${escape(category.toLowerCase())}' AND a.name IN ${addrList}
),
vals AS (
  SELECT * FROM (VALUES
    ${itemValues}
  ) AS t(item_name, section_name)
),
ins AS (
  INSERT INTO item (name, category_id, address_id, expected, section_id)
  SELECT
    v.item_name,
    cats.category_id,
    cats.address_id,
    0,
    CASE
      WHEN v.section_name IS NULL THEN NULL
      ELSE (
        SELECT s.id
        FROM section s
        WHERE s.name = v.section_name
          AND s.address_id = cats.address_id
          AND s.category_id = cats.category_id
      )
    END
  FROM vals v
  CROSS JOIN cats
  WHERE NOT EXISTS (
    SELECT 1
    FROM item i
    WHERE i.name = v.item_name
      AND i.address_id = cats.address_id
      AND i.category_id = cats.category_id
  )
  RETURNING id
)
SELECT COUNT(*) FROM ins;`.trim() : '';

  return [sqlSections, sqlItems].filter(Boolean).join('\n\n') + '\n';
}

function main() {
  const filePath = process.argv[2] || path.join(__dirname, '..', 'position.xlsx');
  const addressesArg = process.argv[3];
  const categoryArg = process.argv[4];
  const addresses = addressesArg ? addressesArg.split(',').map(s => s.trim()).filter(Boolean) : ['Северный', 'Строитель'];
  const category = categoryArg ? categoryArg.trim() : 'бар';
  const pairs = readPairs(filePath);
  const { sections, items } = normalizeData(pairs);
  const sql = buildSql(sections, items, addresses, category);
  console.log(sql);
}

main();
