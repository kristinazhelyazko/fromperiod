import pool from '../../../lib/db.js';
import logger from '../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawAddressId = Number.parseInt(String(searchParams.get('address_id') || ''), 10);
    const addressId = Number.isInteger(rawAddressId) && rawAddressId >= 0 ? rawAddressId : 0;
    const result = await pool.query(
      `SELECT
         ci.id,
         ci.name,
         ci.price,
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
    return Response.json(result.rows);
  } catch (error) {
    logger.error('catalog', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

