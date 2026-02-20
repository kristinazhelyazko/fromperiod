import pool from '../../../../../../lib/db.js';
import logger from '../../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { addressId, categoryId } = params;
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    if (!query || query.length < 3) return Response.json([]);
    const result = await pool.query(
      'SELECT i.id, i.name, s.name AS section_name FROM item i LEFT JOIN section s ON s.id = i.section_id WHERE i.address_id = $1 AND i.category_id = $2 AND LOWER(i.name) LIKE LOWER($3) ORDER BY COALESCE(s.name, \'Без раздела\'), i.name LIMIT 50',
      [addressId, categoryId, `%${query}%`]
    );
    return Response.json(result.rows);
  } catch (error) {
    logger.error('items-search', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
