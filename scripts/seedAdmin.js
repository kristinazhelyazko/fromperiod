require('dotenv').config();
const pool = require('../config/database');
const { hashPassword } = require('../utils/password');

async function seedAdmin() {
  try {
    const rights = await pool.query("SELECT id FROM rights WHERE name='администратор'");
    const rightsId = rights.rows[0].id;
    const login = 'admin_test';
    const password = await hashPassword('admin123');
    await pool.query('INSERT INTO users (login, password, rights_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [login, password, rightsId]);
    console.log('✓ Admin user seeded: admin_test / admin123');
    process.exit(0);
  } catch (e) {
    console.error('Seed admin error', e);
    process.exit(1);
  }
}

seedAdmin();
