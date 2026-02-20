const pool = require('../config/database');
const logger = require('../utils/logger');
const { sendToChannel } = require('./telegramService');

const ADDRESS_CHANNEL_MAP = {
  'Белгород': '-1003868788094',
  'Строитель': '-1002136516687',
  'Северный': '-1002144814016',
  'Тестовый магазин': '-5159177330',
};

function getChannelIdForAddress(addressName) {
  return ADDRESS_CHANNEL_MAP[addressName] || null;
}

async function createReplenish(addressId, categoryId, userId, items, date = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Используем переданную дату или текущую дату
    const replenishDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const dateOnly = replenishDate.split('T')[0];
    

    // Создаем запись привоза
    const replenishResult = await client.query(
      'INSERT INTO replenish (address_id, user_id, date) VALUES ($1, $2, $3) RETURNING id',
      [addressId, userId, replenishDate]
    );
    const replenishId = replenishResult.rows[0].id;

    // Добавляем позиции (создаем эпhemeral item при необходимости)
    for (const item of items) {
      let itemId = item.itemId;
      if (itemId === 0 || !itemId) {
        if (!categoryId) {
          throw new Error('Не выбрана категория для привоза');
        }
        if (!item.name || !item.name.trim()) {
          throw new Error('Пустое наименование позиции');
        }
        const existingItem = await client.query(
          'SELECT id FROM item WHERE name = $1 AND address_id IS NULL AND category_id = $2',
          [item.name, categoryId]
        );
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          const newItemResult = await client.query(
            'INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, NULL, 0) RETURNING id',
            [item.name, categoryId]
          );
          itemId = newItemResult.rows[0].id;
        }
      }
      await client.query(
        'INSERT INTO replenishstock (item_id, replenish_id, qty) VALUES ($1, $2, $3)',
        [itemId, replenishId, Number.isFinite(item.qty) ? Math.max(0, item.qty) : 0]
      );
    }

    await client.query('COMMIT');

    logger.info(`Replenish created: ${replenishId}`);
    return { id: replenishId, addressId, items: items.length };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating replenish:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function updateReplenish(replenishId, items, categoryId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Проверяем существование привоза
    const replenishResult = await client.query(
      'SELECT id, address_id, date FROM replenish WHERE id = $1',
      [replenishId]
    );

    if (replenishResult.rows.length === 0) {
      throw new Error('Replenish not found');
    }

    await client.query('DELETE FROM replenishstock WHERE replenish_id = $1', [replenishId]);

    // Добавляем новые записи (создаем эпhemeral item при необходимости)
    for (const item of items) {
      let itemId = item.itemId;
      if (itemId === 0 || !itemId) {
        if (!categoryId) {
          throw new Error('Не выбрана категория для привоза');
        }
        if (!item.name || !item.name.trim()) {
          throw new Error('Пустое наименование позиции');
        }
        const existingItem = await client.query(
          'SELECT id FROM item WHERE name = $1 AND address_id IS NULL AND category_id = $2',
          [item.name, categoryId]
        );
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          const newItemResult = await client.query(
            'INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, NULL, 0) RETURNING id',
            [item.name, categoryId]
          );
          itemId = newItemResult.rows[0].id;
        }
      }
      await client.query(
        'INSERT INTO replenishstock (item_id, replenish_id, qty) VALUES ($1, $2, $3)',
        [itemId, replenishId, Number.isFinite(item.qty) ? Math.max(0, item.qty) : 0]
      );
    }

    await client.query('COMMIT');

    logger.info(`Replenish updated: ${replenishId}`);
    return { id: replenishId };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating replenish:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getReplenish(replenishId) {
  try {
    const replenishResult = await pool.query(
      `SELECT r.id, r.address_id, r.date, a.name as address_name
       FROM replenish r
       JOIN address a ON r.address_id = a.id
       WHERE r.id = $1`,
      [replenishId]
    );

    if (replenishResult.rows.length === 0) {
      throw new Error('Replenish not found');
    }

    const replenish = replenishResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT rs.id, rs.item_id, rs.qty, i.name as item_name
       FROM replenishstock rs
       JOIN item i ON rs.item_id = i.id
       WHERE rs.replenish_id = $1
       ORDER BY i.name`,
      [replenishId]
    );

    return {
      ...replenish,
      items: itemsResult.rows
    };
  } catch (error) {
    logger.error('Error fetching replenish:', error);
    throw error;
  }
}

async function getCopyText(replenishId) {
  try {
    const replenish = await getReplenish(replenishId);
    
    let text = `📦 Привоз #${replenish.id}\n`;
    text += `Адрес: ${replenish.address_name}\n`;
    text += `Дата: ${new Date(replenish.date).toLocaleDateString('ru-RU')}\n\n`;
    text += `Позиции:\n\n`;

    replenish.items.forEach(item => {
      text += `• ${item.item_name}: ${item.qty} шт.\n`;
    });

    return text;
  } catch (error) {
    logger.error('Error generating copy text:', error);
    throw error;
  }
}

async function sendReplenish(replenishId) {
  try {
    const rep = await getReplenish(replenishId);
    const text = await getCopyText(replenishId);
    const channelByAddress = getChannelIdForAddress(rep.address_name);
    const fallbackChannel = process.env.REPORT_CHANNEL_ID || process.env.ORDER_CHANNEL_ID;
    const targetChannel = channelByAddress || fallbackChannel;
    if (!targetChannel) {
      return { sent: false };
    }
    await sendToChannel(targetChannel, text);
    logger.info(`Replenish sent to channel ${targetChannel} for ${replenishId}`);
    return { sent: true };
  } catch (error) {
    logger.error('Error sending replenish:', error);
    throw error;
  }
}

module.exports = {
  createReplenish,
  updateReplenish,
  getReplenish,
  getCopyText,
  sendReplenish,
};
