import pool from '../../../lib/db.js';
import logger from '../../../lib/logger.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT id, name, price, image_path FROM catalog_item WHERE is_visible = TRUE ORDER BY id'
    );
    // #region agent log
    const rows = result.rows || [];
    const ids = rows.map((r) => r.id);
    const row55 = rows.find((r) => r.id === 55);
    await fetch('http://localhost:7513/ingest/df5f1387-b3a2-499c-ab13-f5d5496e92a7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6db2c2'},body:JSON.stringify({sessionId:'6db2c2',location:'backend/app/api/catalog/route.js:GET',message:'catalog response',data:{count:rows.length,ids,has55:!!row55,row55:row55?{id:row55.id,name:row55.name,image_path:row55.image_path}:null},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return Response.json(result.rows);
  } catch (error) {
    logger.error('catalog', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

