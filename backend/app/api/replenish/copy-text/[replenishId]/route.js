import { getCopyText } from '../../../../../lib/services/replenishService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { replenishId } = params;
    const text = await getCopyText(replenishId);
    return Response.json({ text });
  } catch (error) {
    logger.error('replenish-copy', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
