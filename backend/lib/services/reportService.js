import * as XLSX from 'xlsx';

export function generateReportBuffer(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return createWorkbook(startDate, endDate);
}

async function fetchReplenishRows(pool, startDate, endDate) {
  const res = await pool.query('SELECT r.id, r.date, a.name as address_name, i.name as item_name, rs.qty FROM replenish r JOIN address a ON r.address_id = a.id JOIN replenishstock rs ON r.id = rs.replenish_id JOIN item i ON rs.item_id = i.id WHERE r.date >= $1 AND r.date <= $2 ORDER BY r.date, a.name, i.name', [startDate, endDate]);
  return res.rows;
}

async function fetchStockRows(pool, startDate, endDate) {
  const res = await pool.query('SELECT sr.id, sr.date, a.name as address_name, i.name as item_name, s.qty, i.expected FROM stockreport sr JOIN address a ON sr.address_id = a.id JOIN stock s ON sr.id = s.stockreport_id JOIN item i ON s.item_id = i.id WHERE sr.date >= $1 AND sr.date <= $2 ORDER BY sr.date, a.name, i.name', [startDate, endDate]);
  return res.rows;
}

function aoaForReplenish(rows) {
  const sheet = [['Наименование', 'Дата', 'Количество', 'Итоговая сумма']];
  const grouped = {};
  for (const row of rows) {
    const key = row.item_name;
    grouped[key] ||= { name: key, dates: [], quantities: [], total: 0 };
    grouped[key].dates.push(new Date(row.date).toLocaleDateString('ru-RU'));
    grouped[key].quantities.push(row.qty);
    grouped[key].total += row.qty;
  }
  for (const item of Object.values(grouped)) {
    sheet.push([item.name, item.dates.join(', '), item.quantities.join(', '), item.total]);
  }
  return sheet;
}

function aoaForStock(rows) {
  const sheet = [['Наименование', 'Дата', 'Количество', 'Итоговая сумма']];
  const grouped = {};
  for (const row of rows) {
    const key = row.item_name;
    grouped[key] ||= { name: key, dates: [], quantities: [], total: 0 };
    grouped[key].dates.push(new Date(row.date).toLocaleDateString('ru-RU'));
    grouped[key].quantities.push(row.qty);
    grouped[key].total += row.qty;
  }
  for (const item of Object.values(grouped)) {
    sheet.push([item.name, item.dates.join(', '), item.quantities.join(', '), item.total]);
  }
  return sheet;
}

async function createWorkbook(startDate, endDate) {
  const { default: pool } = await import('../db.js');
  const replenishRows = await fetchReplenishRows(pool, startDate, endDate);
  const stockRows = await fetchStockRows(pool, startDate, endDate);
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(aoaForReplenish(replenishRows));
  const ws2 = XLSX.utils.aoa_to_sheet(aoaForStock(stockRows));
  XLSX.utils.book_append_sheet(wb, ws1, 'Привозы');
  XLSX.utils.book_append_sheet(wb, ws2, 'Пересчеты');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

export default { generateReportBuffer };
