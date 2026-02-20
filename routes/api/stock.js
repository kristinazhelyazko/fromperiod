const express = require('express');
const router = express.Router();
const stockService = require('../../services/stockService');
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// POST /api/stock/create-report - создание нового отчета
router.post('/create-report', async (req, res, next) => {
  try {
    const { addressId, categoryId, items, date } = req.body;
    const userId = req.user?.id || 1; // TODO: получить из сессии

    const report = await stockService.createReport(addressId, categoryId, userId, items, date);
    res.json(report);
  } catch (error) {
    logger.error('Error creating stock report:', error);
    next(error);
  }
});

// PUT /api/stock/update-report/:reportId - обновление отчета
router.put('/update-report/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { items } = req.body;

    const report = await stockService.updateReport(reportId, items);
    res.json(report);
  } catch (error) {
    logger.error('Error updating stock report:', error);
    next(error);
  }
});

// GET /api/stock/report/:reportId - получение отчета
router.get('/report/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await stockService.getReport(reportId);
    res.json(report);
  } catch (error) {
    logger.error('Error fetching stock report:', error);
    next(error);
  }
});

// POST /api/stock/generate-order/:reportId - генерация заказа
router.post('/generate-order/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const order = await stockService.generateOrder(reportId);
    res.json(order);
  } catch (error) {
    logger.error('Error generating order:', error);
    next(error);
  }
});

// POST /api/stock/send-order/:reportId - отправка заказа в канал
router.post('/send-order/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const result = await stockService.sendOrder(reportId);
    res.json(result);
  } catch (error) {
    logger.error('Error sending order:', error);
    next(error);
  }
});

// GET /api/stock/order/:reportId - получение сформированного заказа
router.get('/order/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const order = await stockService.getOrder(reportId);
    res.json(order);
  } catch (error) {
    logger.error('Error fetching order:', error);
    next(error);
  }
});

router.get('/existing', async (req, res, next) => {
  try {
    const { addressId, categoryId, date } = req.query;
    if (!addressId || !categoryId || !date) return res.json({ exists: false, items: [] });
    const reportRes = await pool.query(
      'SELECT id FROM stockreport WHERE address_id = $1 AND category_id = $2 AND date = $3',
      [addressId, categoryId, date]
    );
    if (reportRes.rows.length === 0) return res.json({ exists: false, items: [] });
    const reportId = reportRes.rows[0].id;
    const itemsRes = await pool.query(
      'SELECT item_id, qty FROM stock WHERE stockreport_id = $1',
      [reportId]
    );
    const items = itemsRes.rows.map(r => ({ item_id: r.item_id, qty: r.qty }));
    return res.json({ exists: true, reportId, items });
  } catch (error) {
    logger.error('Error fetching existing stock by date:', error);
    next(error);
  }
});

module.exports = router;
