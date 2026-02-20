const express = require('express');
const router = express.Router();
const reportService = require('../../services/reportService');
const logger = require('../../utils/logger');

// POST /api/reports/generate - генерация Excel отчета
router.post('/generate', async (req, res, next) => {
  try {
    const { monthKey } = req.body; // Формат: YYYY-MM
    
    const filePath = await reportService.generateReport(monthKey);
    
    res.download(filePath, `report_${monthKey}.xlsx`, (err) => {
      if (err) {
        logger.error('Error sending report file:', err);
        next(err);
      }
    });
  } catch (error) {
    logger.error('Error generating report:', error);
    next(error);
  }
});

module.exports = router;


