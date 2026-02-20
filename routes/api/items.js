const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/items/:addressId/:categoryId - позиции для пересчета
router.get('/:addressId/:categoryId', async (req, res, next) => {
  try {
    const { addressId, categoryId } = req.params;
    const result = await pool.query(
      `SELECT i.id, i.name, i.expected, i.section_id, s.name as section_name
       FROM item i
       LEFT JOIN section s ON s.id = i.section_id
       WHERE i.address_id = $1 AND i.category_id = $2
       ORDER BY COALESCE(s.name, 'Без раздела'), i.name`,
      [addressId, categoryId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching items:', error);
    next(error);
  }
});

// GET /api/items/search/:addressId/:categoryId?query=... - поиск позиций
router.get('/search/:addressId/:categoryId', async (req, res, next) => {
  try {
    const { addressId, categoryId } = req.params;
    const { query } = req.query;

    if (!query || query.length < 3) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT i.id, i.name, s.name AS section_name
       FROM item i
       LEFT JOIN section s ON s.id = i.section_id
       WHERE i.address_id = $1 AND i.category_id = $2
       AND LOWER(i.name) LIKE LOWER($3)
       ORDER BY COALESCE(s.name, 'Без раздела'), i.name
       LIMIT 50`,
      [addressId, categoryId, `%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error searching items:', error);
    next(error);
  }
});

module.exports = router;


