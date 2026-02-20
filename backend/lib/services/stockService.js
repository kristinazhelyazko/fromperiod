import pool from '../db.js';
import logger from '../logger.js';
import { sendToChannel } from '../telegram.js';

export async function createReport(addressId, categoryId, userId, items, date = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reportDate = date || new Date().toISOString().split('T')[0];
    const existingReport = await client.query('SELECT id FROM stockreport WHERE address_id = $1 AND category_id = $2 AND date = $3', [addressId, categoryId, reportDate]);
    let reportId;
    if (existingReport.rows.length > 0) {
      reportId = existingReport.rows[0].id;
      await client.query('DELETE FROM stock WHERE stockreport_id = $1', [reportId]);
    } else {
      const reportResult = await client.query('INSERT INTO stockreport (address_id, category_id, date, user_id) VALUES ($1, $2, $3, $4) RETURNING id', [addressId, categoryId, reportDate, userId]);
      reportId = reportResult.rows[0].id;
    }
    for (const item of items) {
      let itemId = item.itemId;
      if (itemId === 0 || !itemId) {
        const existingItem = await client.query('SELECT id FROM item WHERE name = $1 AND address_id = 0 AND category_id = $2', [item.name, categoryId]);
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          const newItemResult = await client.query('INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, 0, 0) RETURNING id', [item.name, categoryId]);
          itemId = newItemResult.rows[0].id;
        }
      }
      await client.query('INSERT INTO stock (item_id, address_id, stockreport_id, qty) VALUES ($1, $2, $3, $4)', [itemId, addressId, reportId, item.qty || 0]);
    }
    await client.query('COMMIT');
    logger.info(`stockreport ${reportId}`);
    return { id: reportId, addressId, categoryId, date: reportDate };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('createReport', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateReport(reportId, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM stock WHERE stockreport_id = $1', [reportId]);
    const reportResult = await client.query('SELECT address_id, category_id FROM stockreport WHERE id = $1', [reportId]);
    if (reportResult.rows.length === 0) throw new Error('Report not found');
    const addressId = reportResult.rows[0].address_id;
    const categoryId = reportResult.rows[0].category_id;
    for (const item of items) {
      let itemId = item.itemId;
      if (itemId === 0 || !itemId) {
        const existingItem = await client.query('SELECT id FROM item WHERE name = $1 AND address_id = 0 AND category_id = $2', [item.name, categoryId]);
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          const newItemResult = await client.query('INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, 0, 0) RETURNING id', [item.name, categoryId]);
          itemId = newItemResult.rows[0].id;
        }
      }
      await client.query('INSERT INTO stock (item_id, address_id, stockreport_id, qty) VALUES ($1, $2, $3, $4)', [itemId, addressId, reportId, item.qty || 0]);
    }
    await client.query('COMMIT');
    logger.info(`stockreport ${reportId}`);
    return { id: reportId };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('updateReport', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getReport(reportId) {
  try {
    const reportResult = await pool.query('SELECT sr.id, sr.address_id, sr.category_id, sr.date, a.name as address_name, c.name as category_name FROM stockreport sr JOIN address a ON sr.address_id = a.id JOIN category c ON sr.category_id = c.id WHERE sr.id = $1', [reportId]);
    if (reportResult.rows.length === 0) throw new Error('Report not found');
    const report = reportResult.rows[0];
    const itemsResult = await pool.query('SELECT s.id, s.item_id, s.qty, i.name as item_name, i.expected FROM stock s JOIN item i ON s.item_id = i.id WHERE s.stockreport_id = $1 ORDER BY i.name', [reportId]);
    return { ...report, items: itemsResult.rows };
  } catch (error) {
    logger.error('getReport', error);
    throw error;
  }
}

export async function generateOrder(reportId) {
  try {
    const report = await getReport(reportId);
    const orderItems = await pool.query('SELECT i.id, i.name, i.expected, COALESCE(s.qty, 0) as current_qty, (i.expected - COALESCE(s.qty, 0)) as needed FROM item i LEFT JOIN stock s ON s.item_id = i.id AND s.stockreport_id = $1 WHERE i.address_id = $2 AND i.category_id = $3 AND (i.expected - COALESCE(s.qty, 0)) > 0 ORDER BY i.name', [reportId, report.address_id, report.category_id]);
    const order = { reportId: report.id, addressName: report.address_name, categoryName: report.category_name, date: report.date, items: orderItems.rows.map(r => ({ id: r.id, name: r.name, expected: r.expected, current: r.current_qty, needed: r.needed })) };
    if (process.env.ORDER_CHANNEL_ID && order.items.length > 0) {
      try {
        const text = formatOrderText(order);
        await sendToChannel(process.env.ORDER_CHANNEL_ID, text);
      } catch (error) {
        logger.error('sendOrder', error);
      }
    }
    return order;
  } catch (error) {
    logger.error('generateOrder', error);
    throw error;
  }
}

function formatOrderText(order) {
  let text = `📦 Заказ для ${order.addressName}\n`;
  text += `Раздел: ${order.categoryName}\n`;
  text += `Дата: ${order.date}\n\n`;
  text += `Необходимо заказать:\n\n`;
  for (const item of order.items) {
    text += `• ${item.name}: ${item.needed} шт. (есть: ${item.current}, нужно: ${item.expected})\n`;
  }
  return text;
}

export async function getOrder(reportId) {
  try {
    return await generateOrder(reportId);
  } catch (error) {
    logger.error('getOrder', error);
    throw error;
  }
}
