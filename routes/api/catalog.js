const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price, image_path FROM catalog_item WHERE is_visible = TRUE ORDER BY id'
    );
    // #region agent log
    const ids = (result.rows || []).map((r) => r.id);
    const row55 = result.rows.find((r) => r.id === 55);
    fetch('http://localhost:7513/ingest/df5f1387-b3a2-499c-ab13-f5d5496e92a7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6db2c2'},body:JSON.stringify({sessionId:'6db2c2',location:'routes/api/catalog.js:GET',message:'catalog response',data:{count:result.rows.length,ids,has55:!!row55,row55:row55?{id:row55.id,name:row55.name,image_path:row55.image_path}:null},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
    const row55Db = await pool.query('SELECT id, is_visible, image_path FROM catalog_item WHERE id = 55');
    fetch('http://localhost:7513/ingest/df5f1387-b3a2-499c-ab13-f5d5496e92a7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6db2c2'},body:JSON.stringify({sessionId:'6db2c2',location:'routes/api/catalog.js:GET',message:'catalog_item id=55 from DB',data:{row:row55Db.rows[0]||null},timestamp:Date.now(),hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching catalog items:', error);
    next(error);
  }
});

module.exports = router;

