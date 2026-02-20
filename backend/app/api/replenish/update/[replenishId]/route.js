import { updateReplenish } from '../../../../../lib/services/replenishService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  try {
    const { replenishId } = params;
    const body = await req.json();
    const { items } = body;
    const rep = await updateReplenish(replenishId, items);
    return Response.json(rep);
  } catch (error) {
    logger.error('replenish-update', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
