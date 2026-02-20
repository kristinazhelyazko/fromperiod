const XLSX = require('xlsx');
const path = require('path');

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

function toSqlValues(pairs) {
  const uniqSections = Array.from(new Set(pairs.map(p => p.section).filter(Boolean)));
  const items = pairs.filter(p => p.item).map(p => ({ section: p.section || 'Без раздела', item: p.item }));
  return { sections: uniqSections, items };
}

function main() {
  const filePath = process.argv[2] || path.join(__dirname, '..', 'position.xlsx');
  const pairs = readPairs(filePath);
  const out = toSqlValues(pairs);
  console.log(JSON.stringify(out, null, 2));
}

main();

