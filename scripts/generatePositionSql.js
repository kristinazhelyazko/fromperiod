const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function escape(s) {
  return String(s).replace(/'/g, "''");
}

function readRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const out = [];
  for (const r of rows) {
    const section = (r[0] ?? '').toString().trim();
    const item = (r[1] ?? '').toString().trim();
    const addr = (r[2] ?? '').toString().trim();
    if (!section && !item && !addr) continue;
    if (!item) continue;
    out.push({ section, item, addr });
  }
  return out;
}

function normalize(rows, addresses) {
  const addrSet = new Set(addresses);
  const secSet = new Set();
  const sections = [];
  const itemSet = new Set();
  const items = [];
  for (const r of rows) {
    const targets = r.addr ? [r.addr] : addresses;
    for (const a of targets) {
      if (!addrSet.has(a)) continue;
      const section = r.section || null;
      if (section) {
        const skey = `${section.toLowerCase()}|${a.toLowerCase()}`;
        if (!secSet.has(skey)) {
          secSet.add(skey);
          sections.push({ name: section, address: a });
        }
      }
      const ikey = `${r.item.toLowerCase()}|${(section || '').toLowerCase()}|${a.toLowerCase()}`;
      if (!itemSet.has(ikey)) {
        itemSet.add(ikey);
        items.push({ item: r.item, section, address: a });
      }
    }
  }
  return { sections, items };
}

function sqlForCategory(category, sections, items, addresses) {
  const addrList = addresses.map(a => `'${escape(a)}'`).join(',');
  const cats = `
WITH cats AS (
  SELECT c.id AS category_id, c.address_id, a.name AS address_name
  FROM category c
  JOIN address a ON a.id = c.address_id
  WHERE LOWER(c.name) = '${escape(category.toLowerCase())}' AND a.name IN (${addrList})
)`.trim();
  const secVals = sections.map(s => `('${escape(s.name)}', '${escape(s.address)}')`).join(',\n  ');
  const itemVals = items.map(i => `('${escape(i.item)}', ${i.section ? `'${escape(i.section)}'` : 'NULL'}, '${escape(i.address)}')`).join(',\n    ');
  const secSql = sections.length ? `
${cats}
INSERT INTO section (name, address_id, category_id)
SELECT v.name, cats.address_id, cats.category_id
FROM (VALUES
  ${secVals}
) AS v(name, address_name)
JOIN cats ON cats.address_name = v.address_name
ON CONFLICT (name, address_id, category_id) DO NOTHING;`.trim() : '';
  const itemSql = items.length ? `
${cats},
vals AS (
  SELECT * FROM (VALUES
    ${itemVals}
  ) AS t(item_name, section_name, address_name)
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
  JOIN cats ON cats.address_name = v.address_name
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
  return [secSql, itemSql].filter(Boolean).join('\n\n');
}

function generate() {
  const filePath = path.join(process.cwd(), 'position.xlsx');
  const wb = XLSX.readFile(filePath);
  const addresses = ['Северный', 'Строитель'];
  const sheets = [
    { name: 'Бар', category: 'бар' },
    { name: 'Цветы', category: 'цветы' }
  ];
  const blocks = [];
  for (const sh of sheets) {
    const rows = readRows(wb, sh.name);
    if (!rows.length) continue;
    const { sections, items } = normalize(rows, addresses);
    const sql = sqlForCategory(sh.category, sections, items, addresses);
    if (sql) blocks.push(sql);
  }
  const out = blocks.join('\n\n');
  const outPath = path.join(process.cwd(), 'position.sql');
  fs.writeFileSync(outPath, out || '');
  console.log(outPath);
}

generate();
