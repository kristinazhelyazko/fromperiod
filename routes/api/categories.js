const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/categories/:addressId - категории по адресу
router.get('/:addressId', async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const result = await pool.query(
      'SELECT id, name FROM category WHERE address_id = $1 ORDER BY name',
      [addressId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching categories:', error);
    next(error);
  }
});

module.exports = router;


