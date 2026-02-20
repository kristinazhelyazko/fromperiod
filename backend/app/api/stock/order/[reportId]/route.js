import { getOrder } from '../../../../../lib/services/stockService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { reportId } = params;
    const order = await getOrder(reportId);
    return Response.json(order);
  } catch (error) {
    logger.error('stock-order-get', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
