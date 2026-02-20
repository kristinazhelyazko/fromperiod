import { Pool } from 'pg';

const sslSetting = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslSetting,
});

export default pool;
