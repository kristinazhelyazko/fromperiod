const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/sections/:addressId/:categoryId - список разделов по адресу и категории
router.get('/:addressId/:categoryId', async (req, res, next) => {
  try {
    const { addressId, categoryId } = req.params;
    const result = await pool.query(
      `SELECT id, name 
       FROM section 
       WHERE (address_id = $1 OR address_id IS NULL)
         AND (category_id = $2 OR category_id IS NULL)
       ORDER BY name`,
      [addressId, categoryId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching sections:', error);
    next(error);
  }
});

module.exports = router;

