import { createReport } from '../../../../lib/services/stockService.js';
import logger from '../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const { addressId, categoryId, items, date } = body;
    const userId = 1;
    const report = await createReport(addressId, categoryId, userId, items, date);
    return Response.json(report);
  } catch (error) {
    logger.error('stock-create', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
