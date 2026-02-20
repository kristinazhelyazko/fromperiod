import { generateOrder } from '../../../../../lib/services/stockService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  try {
    const { reportId } = params;
    const order = await generateOrder(reportId);
    return Response.json(order);
  } catch (error) {
    logger.error('stock-order-generate', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
