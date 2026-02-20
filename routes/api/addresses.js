const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/addresses - список всех адресов
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name FROM address ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching addresses:', error);
    next(error);
  }
});

module.exports = router;


