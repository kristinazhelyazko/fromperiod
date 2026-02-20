import { createReplenish } from '../../../../lib/services/replenishService.js';
import logger from '../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const { addressId, items, date } = body;
    const userId = 1;
    const rep = await createReplenish(addressId, userId, items, date);
    return Response.json(rep);
  } catch (error) {
    logger.error('replenish-create', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
