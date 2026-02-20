import { updateReport } from '../../../../../lib/services/stockService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  try {
    const { reportId } = params;
    const body = await req.json();
    const { items } = body;
    const report = await updateReport(reportId, items);
    return Response.json(report);
  } catch (error) {
    logger.error('stock-update', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
