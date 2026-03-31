const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

// GET /api/catalog/sections?address_id=... - список разделов каталога (фильтр по адресу)
router.get('/sections', async (req, res, next) => {
  try {
    const rawAddressId = Number.parseInt(String(req.query.address_id || ''), 10);
    const addressId = Number.isInteger(rawAddressId) && rawAddressId >= 0 ? rawAddressId : 0;

    if (addressId > 0) {
      const filtered = await pool.query(
        'SELECT id, name FROM catalog_section WHERE address_id IS NULL OR address_id = $1 ORDER BY id',
        [addressId]
      );
      res.json(filtered.rows);
      return;
    }

    const result = await pool.query('SELECT id, name FROM catalog_section ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching catalog sections:', error);
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rawAddressId = Number.parseInt(String(req.query.address_id || ''), 10);
    const addressId = Number.isInteger(rawAddressId) && rawAddressId >= 0 ? rawAddressId : 0;
    const result = await pool.query(
      `SELECT
         ci.id,
         ci.name,
         ci.price,
         ci.section_id,
         ci.image_path,
         COALESCE(
           json_agg(cip.image_path ORDER BY cip.sort_order) FILTER (WHERE cip.id IS NOT NULL),
           '[]'::json
         ) AS images
       FROM catalog_item ci
       LEFT JOIN catalog_item_photo cip ON cip.catalog_item_id = ci.id
       WHERE ci.is_visible = TRUE
         AND (ci.address_id = 0 OR ci.address_id = $1)
       GROUP BY ci.id
       ORDER BY ci.id`,
      [addressId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching catalog items:', error);
    next(error);
  }
});

module.exports = router;

