const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/addresses - список всех адресов
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name FROM address WHERE is_visible_in_store = TRUE ORDER BY name');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching addresses:', error);
    next(error);
  }
});

module.exports = router;


