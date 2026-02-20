import { generateReportBuffer } from '../../../../lib/services/reportService.js';
import logger from '../../../../lib/logger.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const { monthKey } = body;
    const buffer = await generateReportBuffer(monthKey);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${monthKey}.xlsx"`
      }
    });
  } catch (error) {
    logger.error('reports-generate', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
