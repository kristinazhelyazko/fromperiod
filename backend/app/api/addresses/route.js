import pool from '../../../lib/db.js';
import logger from '../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await pool.query('SELECT id, name FROM address ORDER BY name');
    return Response.json(result.rows);
  } catch (error) {
    logger.error('addresses', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
