import pool from '../../../../../lib/db.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { addressId, categoryId } = params;
    const result = await pool.query(
      'SELECT i.id, i.name, i.expected, s.name AS section_name FROM item i LEFT JOIN section s ON s.id = i.section_id WHERE i.address_id = $1 AND i.category_id = $2 ORDER BY COALESCE(s.name, \'Без раздела\'), i.name',
      [addressId, categoryId]
    );
    return Response.json(result.rows);
  } catch (error) {
    logger.error('items', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
