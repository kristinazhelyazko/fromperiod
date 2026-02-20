const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const logger = require('../utils/logger');

async function generateReport(monthKey) {
  try {
    // Парсим месяц (формат: YYYY-MM)
    const [year, month] = monthKey.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Получаем данные привозов
    const replenishData = await pool.query(
      `SELECT r.id, r.date, a.name as address_name, i.name as item_name, rs.qty
       FROM replenish r
       JOIN address a ON r.address_id = a.id
       JOIN replenishstock rs ON r.id = rs.replenish_id
       JOIN item i ON rs.item_id = i.id
       WHERE r.date >= $1 AND r.date <= $2
       ORDER BY r.date, a.name, i.name`,
      [startDate, endDate]
    );

    // Получаем данные пересчетов
    const stockData = await pool.query(
      `SELECT sr.id, sr.date, a.name as address_name, i.name as item_name, s.qty, i.expected
       FROM stockreport sr
       JOIN address a ON sr.address_id = a.id
       JOIN stock s ON sr.id = s.stockreport_id
       JOIN item i ON s.item_id = i.id
       WHERE sr.date >= $1 AND sr.date <= $2
       ORDER BY sr.date, a.name, i.name`,
      [startDate, endDate]
    );

    // Создаем рабочую книгу
    const workbook = XLSX.utils.book_new();

    // Лист 1: Привозы
    const replenishSheet = formatReplenishData(replenishData.rows);
    const wsReplenish = XLSX.utils.aoa_to_sheet(replenishSheet);
    XLSX.utils.book_append_sheet(workbook, wsReplenish, 'Привозы');

    // Лист 2: Пересчеты
    const stockSheet = formatStockData(stockData.rows);
    const wsStock = XLSX.utils.aoa_to_sheet(stockSheet);
    XLSX.utils.book_append_sheet(workbook, wsStock, 'Пересчеты');

    // Сохраняем файл
    const fileName = `report_${monthKey}_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // Создаем директорию temp, если её нет
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    XLSX.writeFile(workbook, filePath);

    logger.info(`Report generated: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('Error generating report:', error);
    throw error;
  }
}

function formatReplenishData(rows) {
  const sheet = [['Наименование', 'Дата', 'Количество', 'Итоговая сумма']];
  
  // Группируем по наименованию
  const grouped = {};
  rows.forEach(row => {
    const key = row.item_name;
    if (!grouped[key]) {
      grouped[key] = {
        name: key,
        dates: [],
        quantities: [],
        total: 0
      };
    }
    grouped[key].dates.push(new Date(row.date).toLocaleDateString('ru-RU'));
    grouped[key].quantities.push(row.qty);
    grouped[key].total += row.qty;
  });

  // Формируем строки
  Object.values(grouped).forEach(item => {
    const datesStr = item.dates.join(', ');
    const quantitiesStr = item.quantities.join(', ');
    sheet.push([item.name, datesStr, quantitiesStr, item.total]);
  });

  return sheet;
}

function formatStockData(rows) {
  const sheet = [['Наименование', 'Дата', 'Количество', 'Итоговая сумма']];
  
  // Группируем по наименованию
  const grouped = {};
  rows.forEach(row => {
    const key = row.item_name;
    if (!grouped[key]) {
      grouped[key] = {
        name: key,
        dates: [],
        quantities: [],
        total: 0
      };
    }
    grouped[key].dates.push(new Date(row.date).toLocaleDateString('ru-RU'));
    grouped[key].quantities.push(row.qty);
    grouped[key].total += row.qty;
  });

  // Формируем строки
  Object.values(grouped).forEach(item => {
    const datesStr = item.dates.join(', ');
    const quantitiesStr = item.quantities.join(', ');
    sheet.push([item.name, datesStr, quantitiesStr, item.total]);
  });

  return sheet;
}

async function listRecountDatesLast3Months() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 3, end.getDate());
  const res = await pool.query(
    'SELECT DISTINCT date AS d FROM stockreport WHERE date >= $1 AND date <= $2 ORDER BY d DESC',
    [start, end]
  );
  return res.rows.map(r => {
    const dt = new Date(r.d);
    return dt.toISOString().slice(0, 10);
  });
}

async function listAddresses() {
  const res = await pool.query('SELECT id, name FROM address ORDER BY name');
  return res.rows;
}

async function listRecountDatesLast3MonthsByAddress(addressId) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 3, end.getDate());
  const res = await pool.query(
    'SELECT DISTINCT date AS d FROM stockreport WHERE address_id = $1 AND date >= $2 AND date <= $3 ORDER BY d DESC',
    [addressId, start, end]
  );
  return res.rows.map(r => {
    const dt = new Date(r.d);
    return dt.toISOString().slice(0, 10);
  });
}

async function generateRecountReportByDate(dateKey) {
  try {
    const res = await pool.query(
      `SELECT c.name AS category_name, i.name AS item_name, s.qty
       FROM stockreport sr
       JOIN category c ON sr.category_id = c.id
       JOIN stock s ON s.stockreport_id = sr.id
       JOIN item i ON i.id = s.item_id
       WHERE sr.date = $1
       ORDER BY c.name, i.name`,
      [dateKey]
    );
    const rows = res.rows;
    const byCategory = new Map();
    for (const r of rows) {
      const cat = r.category_name || 'Категория';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push([r.item_name, r.qty]);
    }
    const workbook = XLSX.utils.book_new();
    if (byCategory.size === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['Наименование', 'Количество']]);
      XLSX.utils.book_append_sheet(workbook, ws, 'Пересчет');
    } else {
      for (const [cat, items] of byCategory.entries()) {
        const sheet = [['Наименование', 'Количество'], ...items];
        const ws = XLSX.utils.aoa_to_sheet(sheet);
        XLSX.utils.book_append_sheet(workbook, ws, cat.slice(0, 31));
      }
    }
    const fileName = `recount_${dateKey}_${Date.now()}.xlsx`;
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);
    XLSX.writeFile(workbook, filePath);
    logger.info(`Recount report generated: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('generateRecountReportByDate', error);
    throw error;
  }
}

async function generateRecountReportByDateForAddress(addressId, dateKey) {
  try {
    const res = await pool.query(
      `SELECT c.name AS category_name, i.name AS item_name, s.qty
       FROM stockreport sr
       JOIN category c ON sr.category_id = c.id
       JOIN stock s ON s.stockreport_id = sr.id
       JOIN item i ON i.id = s.item_id
       WHERE sr.address_id = $1 AND sr.date = $2
       ORDER BY c.name, i.name`,
      [addressId, dateKey]
    );
    const rows = res.rows;
    const byCategory = new Map();
    for (const r of rows) {
      const cat = r.category_name || 'Категория';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push([r.item_name, r.qty]);
    }
    const workbook = XLSX.utils.book_new();
    if (byCategory.size === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['Наименование', 'Количество']]);
      XLSX.utils.book_append_sheet(workbook, ws, 'Пересчет');
    } else {
      for (const [cat, items] of byCategory.entries()) {
        const sheet = [['Наименование', 'Количество'], ...items];
        const ws = XLSX.utils.aoa_to_sheet(sheet);
        XLSX.utils.book_append_sheet(workbook, ws, cat.slice(0, 31));
      }
    }
    const fileName = `recount_${addressId}_${dateKey}_${Date.now()}.xlsx`;
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);
    XLSX.writeFile(workbook, filePath);
    logger.info(`Recount report generated: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('generateRecountReportByDateForAddress', error);
    throw error;
  }
}

async function generateReplenishReportByMonth(monthKey) {
  try {
    const [year, month] = monthKey.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const res = await pool.query(
      `SELECT r.date, i.name AS item_name, COALESCE(s.name, 'Без раздела') AS section_name, rs.qty
       FROM replenish r
       JOIN replenishstock rs ON r.id = rs.replenish_id
       JOIN item i ON rs.item_id = i.id
       LEFT JOIN section s ON s.id = i.section_id
       WHERE r.date >= $1 AND r.date <= $2
       ORDER BY r.date, section_name, item_name`,
      [startDate, endDate]
    );
    const rows = res.rows.map(r => ({
      date: new Date(r.date),
      item_name: r.item_name,
      section_name: r.section_name,
      qty: r.qty
    }));
    const dates = Array.from(new Set(rows.map(r => r.date.toISOString().slice(0, 10)))).sort();
    const workbook = XLSX.utils.book_new();
    for (const d of dates) {
      const label = new Date(d).toLocaleDateString('ru-RU');
      const dayRows = rows.filter(r => r.date.toISOString().slice(0, 10) === d);
      const sheetRows = [['Наименование', 'Раздел', 'Количество']];
      for (const r of dayRows) {
        sheetRows.push([r.item_name, r.section_name, r.qty]);
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, ws, label.slice(0, 31));
    }
    const headerDates = dates.map(d => new Date(d).toLocaleDateString('ru-RU'));
    const summaryHeader = ['Наименование', 'Раздел', ...headerDates, 'Количество за месяц'];
    const byItem = new Map();
    for (const r of rows) {
      const key = `${r.item_name}||${r.section_name}`;
      if (!byItem.has(key)) byItem.set(key, { item_name: r.item_name, section_name: r.section_name, perDate: {}, total: 0 });
      const kdate = r.date.toISOString().slice(0, 10);
      byItem.get(key).perDate[kdate] = (byItem.get(key).perDate[kdate] || 0) + (r.qty || 0);
      byItem.get(key).total += r.qty || 0;
    }
    const summaryRows = [summaryHeader];
    for (const entry of byItem.values()) {
      const perDates = dates.map(d => entry.perDate[d] || 0);
      summaryRows.push([entry.item_name, entry.section_name, ...perDates, entry.total]);
    }
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Итог по месяцу');
    const fileName = `replenish_${monthKey}_${Date.now()}.xlsx`;
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);
    XLSX.writeFile(workbook, filePath);
    logger.info(`Replenish report generated: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('generateReplenishReportByMonth', error);
    throw error;
  }
}

async function generateReplenishReportByMonthForAddress(addressId, monthKey) {
  try {
    const [year, month] = monthKey.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const res = await pool.query(
      `SELECT r.date, i.name AS item_name, COALESCE(s.name, 'Без раздела') AS section_name, rs.qty
       FROM replenish r
       JOIN replenishstock rs ON r.id = rs.replenish_id
       JOIN item i ON rs.item_id = i.id
       LEFT JOIN section s ON s.id = i.section_id
       WHERE r.address_id = $3 AND r.date >= $1 AND r.date <= $2
       ORDER BY r.date, section_name, item_name`,
      [startDate, endDate, addressId]
    );
    const rows = res.rows.map(r => ({
      date: new Date(r.date),
      item_name: r.item_name,
      section_name: r.section_name,
      qty: r.qty
    }));
    const dates = Array.from(new Set(rows.map(r => r.date.toISOString().slice(0, 10)))).sort();
    const workbook = XLSX.utils.book_new();
    for (const d of dates) {
      const label = new Date(d).toLocaleDateString('ru-RU');
      const dayRows = rows.filter(r => r.date.toISOString().slice(0, 10) === d);
      const sheetRows = [['Наименование', 'Раздел', 'Количество']];
      for (const r of dayRows) {
        sheetRows.push([r.item_name, r.section_name, r.qty]);
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, ws, label.slice(0, 31));
    }
    const headerDates = dates.map(d => new Date(d).toLocaleDateString('ru-RU'));
    const summaryHeader = ['Наименование', 'Раздел', ...headerDates, 'Количество за месяц'];
    const byItem = new Map();
    for (const r of rows) {
      const key = `${r.item_name}||${r.section_name}`;
      if (!byItem.has(key)) byItem.set(key, { item_name: r.item_name, section_name: r.section_name, perDate: {}, total: 0 });
      const kdate = r.date.toISOString().slice(0, 10);
      byItem.get(key).perDate[kdate] = (byItem.get(key).perDate[kdate] || 0) + (r.qty || 0);
      byItem.get(key).total += r.qty || 0;
    }
    const summaryRows = [summaryHeader];
    for (const entry of byItem.values()) {
      const perDates = dates.map(d => entry.perDate[d] || 0);
      summaryRows.push([entry.item_name, entry.section_name, ...perDates, entry.total]);
    }
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Итог по месяцу');
    const fileName = `replenish_${addressId}_${monthKey}_${Date.now()}.xlsx`;
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);
    XLSX.writeFile(workbook, filePath);
    logger.info(`Replenish report generated: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error('generateReplenishReportByMonthForAddress', error);
    throw error;
  }
}

module.exports = {
  generateReport,
  listRecountDatesLast3Months,
  listAddresses,
  listRecountDatesLast3MonthsByAddress,
  generateRecountReportByDate,
  generateRecountReportByDateForAddress,
  generateReplenishReportByMonth,
  generateReplenishReportByMonthForAddress,
};
