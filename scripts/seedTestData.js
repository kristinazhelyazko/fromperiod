require('dotenv').config();
const pool = require('../config/database');

async function seed() {
  try {
    const addresses = await pool.query('SELECT id, name FROM address ORDER BY id');
    for (const addr of addresses.rows) {
      const cats = await pool.query('SELECT id, name FROM category WHERE address_id = $1 ORDER BY id', [addr.id]);
      for (const cat of cats.rows) {
        const base = `${addr.name}-${cat.name}`;
        const items = [
          { name: `${base}-товар-1`, expected: 10 },
          { name: `${base}-товар-2`, expected: 5 },
          { name: `${base}-товар-3`, expected: 0 },
        ];
        for (const it of items) {
          await pool.query(
            'INSERT INTO item (name, category_id, address_id, expected) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [it.name, cat.id, addr.id, it.expected]
          );
        }
      }
    }
    console.log('✓ Test items seeded');
    process.exit(0);
  } catch (e) {
    console.error('Seed error', e);
    process.exit(1);
  }
}

seed();
