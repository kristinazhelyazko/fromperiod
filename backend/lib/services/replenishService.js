import pool from '../db.js';
import logger from '../logger.js';

export async function createReplenish(addressId, userId, items, date = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const replenishDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const dateOnly = replenishDate.split('T')[0];
    const existingReplenish = await client.query('SELECT r.id FROM replenish r JOIN replenishstock rs ON r.id = rs.replenish_id WHERE r.address_id = $1 AND DATE(r.date) = $2 GROUP BY r.id HAVING COUNT(DISTINCT rs.item_id) = $3', [addressId, dateOnly, items.length]);
    if (existingReplenish.rows.length > 0) throw new Error('Привоз с такими же позициями уже существует за выбранную дату');
    const replenishResult = await client.query('INSERT INTO replenish (address_id, user_id, date) VALUES ($1, $2, $3) RETURNING id', [addressId, userId, replenishDate]);
    const replenishId = replenishResult.rows[0].id;
    for (const item of items) {
      await client.query('INSERT INTO replenishstock (item_id, replenish_id, qty) VALUES ($1, $2, $3)', [item.itemId, replenishId, item.qty || 0]);
    }
    await client.query('COMMIT');
    logger.info(`replenish ${replenishId}`);
    return { id: replenishId, addressId, items: items.length };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('createReplenish', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateReplenish(replenishId, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const replenishResult = await client.query('SELECT id FROM replenish WHERE id = $1', [replenishId]);
    if (replenishResult.rows.length === 0) throw new Error('Replenish not found');
    await client.query('DELETE FROM replenishstock WHERE replenish_id = $1', [replenishId]);
    for (const item of items) {
      await client.query('INSERT INTO replenishstock (item_id, replenish_id, qty) VALUES ($1, $2, $3)', [item.itemId, replenishId, item.qty || 0]);
    }
    await client.query('COMMIT');
    logger.info(`replenish ${replenishId}`);
    return { id: replenishId };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('updateReplenish', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getReplenish(replenishId) {
  try {
    const replenishResult = await pool.query('SELECT r.id, r.address_id, r.date, a.name as address_name FROM replenish r JOIN address a ON r.address_id = a.id WHERE r.id = $1', [replenishId]);
    if (replenishResult.rows.length === 0) throw new Error('Replenish not found');
    const replenish = replenishResult.rows[0];
    const itemsResult = await pool.query('SELECT rs.id, rs.item_id, rs.qty, i.name as item_name FROM replenishstock rs JOIN item i ON rs.item_id = i.id WHERE rs.replenish_id = $1 ORDER BY i.name', [replenishId]);
    return { ...replenish, items: itemsResult.rows };
  } catch (error) {
    logger.error('getReplenish', error);
    throw error;
  }
}

export async function getCopyText(replenishId) {
  const rep = await getReplenish(replenishId);
  let text = `📦 Привоз #${rep.id}\n`;
  text += `Адрес: ${rep.address_name}\n`;
  text += `Дата: ${new Date(rep.date).toLocaleDateString('ru-RU')}\n\n`;
  text += `Позиции:\n\n`;
  for (const item of rep.items) {
    text += `• ${item.item_name}: ${item.qty} шт.\n`;
  }
  return text;
}

export default { createReplenish, updateReplenish, getReplenish, getCopyText };
