require('dotenv').config();
const pool = require('../config/database');

async function runQuery(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function main() {
  try {
    const ordersCols = await runQuery(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('payment_status_id','total_cost','paid_amount') ORDER BY column_name"
    );
    console.log('orders columns:', ordersCols);

    const paymentStatusRows = await runQuery(
      "SELECT id, name FROM payment_status ORDER BY id"
    );
    console.log('payment_status rows:', paymentStatusRows);

    const remindersCols = await runQuery(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reminders' ORDER BY column_name"
    );
    console.log('reminders columns:', remindersCols);

    const remindersUnique = await runQuery(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'reminders'::regclass AND contype = 'u'"
    );
    console.log('reminders unique constraints:', remindersUnique);

    const reminderTypes = await runQuery(
      "SELECT DISTINCT trigger_type FROM reminders ORDER BY trigger_type"
    );
    console.log('existing reminder types:', reminderTypes);
  } catch (e) {
    console.error('Schema verification error:', e);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

