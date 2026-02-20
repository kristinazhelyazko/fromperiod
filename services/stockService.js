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

async function createReport(addressId, categoryId, userId, items, date = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Используем переданную дату или текущую дату
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // Проверяем, нет ли уже отчета за выбранную дату
    const existingReport = await client.query(
      'SELECT id FROM stockreport WHERE address_id = $1 AND category_id = $2 AND date = $3',
      [addressId, categoryId, reportDate]
    );

    let reportId;
    if (existingReport.rows.length > 0) {
      // Обновляем существующий отчет
      reportId = existingReport.rows[0].id;
      await client.query('DELETE FROM stock WHERE stockreport_id = $1', [reportId]);
    } else {
      // Создаем новый отчет
      const reportResult = await client.query(
        'INSERT INTO stockreport (address_id, category_id, date, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [addressId, categoryId, reportDate, userId]
      );
      reportId = reportResult.rows[0].id;
    }

    // Добавляем записи в stock
    for (const item of items) {
      let itemId = item.itemId;
      
      // Если item_id = 0, это новая позиция - создаем запись в item с address_id = NULL (эпhemeral)
      if (itemId === 0 || !itemId) {
        // Сначала проверяем, существует ли уже такая позиция
        const existingItem = await client.query(
          'SELECT id FROM item WHERE name = $1 AND address_id IS NULL AND category_id = $2',
          [item.name, categoryId]
        );
        
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          // Создаем новую позицию с address_id=0
          const newItemResult = await client.query(
            'INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, NULL, 0) RETURNING id',
            [item.name, categoryId]
          );
          itemId = newItemResult.rows[0].id;
        }
      }
      
      await client.query(
        'INSERT INTO stock (item_id, address_id, stockreport_id, qty) VALUES ($1, $2, $3, $4)',
        [itemId, addressId, reportId, item.qty || 0]
      );
    }

    await client.query('COMMIT');

    logger.info(`Stock report created/updated: ${reportId}`);
    return { id: reportId, addressId, categoryId, date: reportDate };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating stock report:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function updateReport(reportId, items) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Удаляем старые записи
    await client.query('DELETE FROM stock WHERE stockreport_id = $1', [reportId]);

    // Получаем данные отчета
    const reportResult = await client.query(
      'SELECT address_id FROM stockreport WHERE id = $1',
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }

    const addressId = reportResult.rows[0].address_id;

    // Добавляем новые записи
    for (const item of items) {
      let itemId = item.itemId;
      
      // Если item_id = 0, это новая позиция (эпhemeral, без address_id)
      if (itemId === 0 || !itemId) {
        // Получаем category_id из отчета
        const reportData = await client.query(
          'SELECT category_id FROM stockreport WHERE id = $1',
          [reportId]
        );
        const categoryId = reportData.rows[0].category_id;
        
        // Проверяем, существует ли уже такая позиция
        const existingItem = await client.query(
          'SELECT id FROM item WHERE name = $1 AND address_id IS NULL AND category_id = $2',
          [item.name, categoryId]
        );
        
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
        } else {
          // Создаем новую позицию с address_id = NULL
          const newItemResult = await client.query(
            'INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, NULL, 0) RETURNING id',
            [item.name, categoryId]
          );
          itemId = newItemResult.rows[0].id;
        }
      }
      
      await client.query(
        'INSERT INTO stock (item_id, address_id, stockreport_id, qty) VALUES ($1, $2, $3, $4)',
        [itemId, addressId, reportId, item.qty || 0]
      );
    }

    await client.query('COMMIT');

    logger.info(`Stock report updated: ${reportId}`);
    return { id: reportId };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating stock report:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getReport(reportId) {
  try {
    const reportResult = await pool.query(
      `SELECT sr.id, sr.address_id, sr.category_id, sr.date, a.name as address_name, c.name as category_name
       FROM stockreport sr
       JOIN address a ON sr.address_id = a.id
       JOIN category c ON sr.category_id = c.id
       WHERE sr.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }

    const report = reportResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT s.id, s.item_id, s.qty, i.name as item_name, i.expected
       FROM stock s
       JOIN item i ON s.item_id = i.id
       WHERE s.stockreport_id = $1
       ORDER BY i.name`,
      [reportId]
    );

    return {
      ...report,
      items: itemsResult.rows
    };
  } catch (error) {
    logger.error('Error fetching stock report:', error);
    throw error;
  }
}

async function generateOrder(reportId) {
  try {
    const report = await getReport(reportId);
    const orderItems = await pool.query(
      `SELECT i.id, i.name, i.expected, COALESCE(s.qty, 0) as current_qty,
              (i.expected - COALESCE(s.qty, 0)) as needed
       FROM item i
       LEFT JOIN stock s ON s.item_id = i.id AND s.stockreport_id = $1
       WHERE i.address_id = $2 AND i.category_id = $3
       AND (i.expected - COALESCE(s.qty, 0)) > 0
       ORDER BY i.name`,
      [reportId, report.address_id, report.category_id]
    );
    const order = {
      reportId: report.id,
      addressName: report.address_name,
      categoryName: report.category_name,
      date: report.date,
      items: orderItems.rows.map(item => ({
        id: item.id,
        name: item.name,
        expected: item.expected,
        current: item.current_qty,
        needed: item.needed
      }))
    };
    return order;
  } catch (error) {
    logger.error('Error generating order:', error);
    throw error;
  }
}

function formatOrderText(order) {
  let text = `📦 Заказ для ${order.addressName}\n`;
  text += `Раздел: ${order.categoryName}\n`;
  text += `Дата: ${order.date}\n\n`;
  text += `Необходимо заказать:\n\n`;

  order.items.forEach(item => {
    text += `• ${item.name}: ${item.needed} шт. (есть: ${item.current}, нужно: ${item.expected})\n`;
  });

  return text;
}

async function getOrder(reportId) {
  try {
    return await generateOrder(reportId);
  } catch (error) {
    logger.error('Error fetching order:', error);
    throw error;
  }
}

async function sendOrder(reportId) {
  try {
    const order = await generateOrder(reportId);
    const channelByAddress = getChannelIdForAddress(order.addressName);
    const fallbackChannel = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
    const targetChannel = channelByAddress || fallbackChannel;
    if (!targetChannel || order.items.length === 0) {
      return { sent: false };
    }
    const idStr = String(targetChannel);
  if (!/^-\d+$/.test(idStr)) {
    logger.error(`Invalid channel id "${idStr}" for address "${order.addressName}"`);
    return { sent: false };
  }
    const text = formatOrderText(order);
    await sendToChannel(targetChannel, text);
    logger.info(`Order sent to channel ${targetChannel} for report ${reportId}`);
    return { sent: true };
  } catch (error) {
    try {
      const rep = await getReport(reportId);
      const channelByAddress = getChannelIdForAddress(rep.address_name);
      const fallbackChannel = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
      const targetChannel = channelByAddress || fallbackChannel;
      logger.error(`Error sending order to channel ${targetChannel} for report ${reportId}:`, error);
    } catch (_) {
      logger.error('Error sending order (target channel unknown):', error);
    }
    throw error;
  }
}

module.exports = {
  createReport,
  updateReport,
  getReport,
  generateOrder,
  getOrder,
  sendOrder,
};
