import pool from '../../../lib/db.js';
import logger from '../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT id, name, price, image_path FROM catalog_item WHERE is_visible = TRUE ORDER BY id'
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

