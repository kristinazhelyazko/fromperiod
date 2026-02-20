import { getReplenish } from '../../../../lib/services/replenishService.js';
import logger from '../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { replenishId } = params;
    const rep = await getReplenish(replenishId);
    return Response.json(rep);
  } catch (error) {
    logger.error('replenish-get', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
