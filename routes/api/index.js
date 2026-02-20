const express = require('express');
const router = express.Router();

// API routes
router.use('/addresses', require('./addresses'));
router.use('/categories', require('./categories'));
router.use('/items', require('./items'));
router.use('/sections', require('./sections'));
router.use('/stock', require('./stock'));
router.use('/replenish', require('./replenish'));
router.use('/reports', require('./reports'));

module.exports = router;


