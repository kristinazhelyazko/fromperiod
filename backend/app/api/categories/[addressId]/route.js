import pool from '../../../../lib/db.js';
import logger from '../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { addressId } = params;
    const result = await pool.query('SELECT id, name FROM category WHERE address_id = $1 ORDER BY name', [addressId]);
    return Response.json(result.rows);
  } catch (error) {
    logger.error('categories', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
