const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    const files = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.sql'))
      .sort();

    logger.info('Running migrations...');
    for (const file of files) {
      const migrationFile = path.join(__dirname, file);
      const sql = fs.readFileSync(migrationFile, 'utf8');
      logger.info(`Applying migration: ${file}`);
      await pool.query(sql);
    }
    logger.info('Migrations completed successfully');
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();


