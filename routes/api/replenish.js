const express = require('express');
const router = express.Router();
const replenishService = require('../../services/replenishService');
const logger = require('../../utils/logger');

// POST /api/replenish/create - создание привоза
router.post('/create', async (req, res, next) => {
  try {
    const { addressId, categoryId, items, date } = req.body;
    const userId = req.user?.id || 1; // TODO: получить из сессии

    const replenish = await replenishService.createReplenish(addressId, categoryId, userId, items, date);
    res.json(replenish);
  } catch (error) {
    logger.error('Error creating replenish:', error);
    next(error);
  }
});

// PUT /api/replenish/update/:replenishId - обновление привоза
router.put('/update/:replenishId', async (req, res, next) => {
  try {
    const { replenishId } = req.params;
    const { items, categoryId } = req.body;

    const replenish = await replenishService.updateReplenish(replenishId, items, categoryId);
    res.json(replenish);
  } catch (error) {
    logger.error('Error updating replenish:', error);
    next(error);
  }
});

// GET /api/replenish/copy-text/:replenishId - текст для копирования
router.get('/copy-text/:replenishId', async (req, res, next) => {
  try {
    const { replenishId } = req.params;
    const text = await replenishService.getCopyText(replenishId);
    res.json({ text });
  } catch (error) {
    logger.error('Error getting copy text:', error);
    next(error);
  }
});

// POST /api/replenish/send/:replenishId - отправка привоза в канал
router.post('/send/:replenishId', async (req, res, next) => {
  try {
    const { replenishId } = req.params;
    const result = await replenishService.sendReplenish(replenishId);
    res.json(result);
  } catch (error) {
    logger.error('Error sending replenish:', error);
    next(error);
  }
});

// GET /api/replenish/existing?addressId=..&categoryId=..&date=YYYY-MM-DD
router.get('/existing', async (req, res, next) => {
  try {
    const { addressId, categoryId, date } = req.query;
    if (!addressId || !categoryId || !date) return res.json({ exists: false, items: [] });
    const result = await require('../../config/database').query(
      `SELECT r.id as replenish_id, i.name, rs.qty
       FROM replenish r
       JOIN replenishstock rs ON r.id = rs.replenish_id
       JOIN item i ON i.id = rs.item_id
       WHERE r.address_id = $1 AND DATE(r.date) = $2 AND i.category_id = $3
       ORDER BY i.name`,
      [addressId, date, categoryId]
    );
    if (result.rows.length === 0) return res.json({ exists: false, items: [] });
    const items = result.rows.map(r => ({ name: r.name, qty: r.qty }));
    return res.json({ exists: true, replenishId: result.rows[0].replenish_id, items });
  } catch (error) {
    logger.error('Error fetching existing replenish by date:', error);
    next(error);
  }
});

// GET /api/replenish/:replenishId - получение привоза
router.get('/:replenishId', async (req, res, next) => {
  try {
    const { replenishId } = req.params;
    const idNum = parseInt(replenishId, 10);
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ error: 'Invalid replenish id' });
    }
    const replenish = await replenishService.getReplenish(idNum);
    res.json(replenish);
  } catch (error) {
    logger.error('Error fetching replenish:', error);
    next(error);
  }
});

module.exports = router;
