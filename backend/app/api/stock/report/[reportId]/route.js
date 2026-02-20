import { getReport } from '../../../../../lib/services/stockService.js';
import logger from '../../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const { reportId } = params;
    const report = await getReport(reportId);
    return Response.json(report);
  } catch (error) {
    logger.error('stock-get', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
