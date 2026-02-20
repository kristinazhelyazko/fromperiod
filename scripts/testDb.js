const path = require('path');
require('dotenv').config();
function stubModule(relPath, stub) {
  const full = path.resolve(__dirname, relPath);
  const key = require.resolve(full);
  delete require.cache[key];
  require.cache[key] = { exports: stub };
}
const sentChannels = [];
stubModule('../services/telegramService.js', {
  initializeBot: () => null,
  getBot: () => null,
  sendToChannel: async (channelId, message, options = {}) => {
    sentChannels.push({ channelId: String(channelId), message, options });
  },
  sendDocumentToChannel: async () => {},
  sendPhotoToChannel: async () => {},
  sendMediaGroupToChannel: async () => {},
});
const pool = require('../config/database');
const orderService = require('../services/orderService');
const userService = require('../services/userService');
const { processDueReminders } = require('../services/reminderService');
async function getUserId(login) {
  const res = await pool.query('SELECT id FROM users WHERE login = $1', [login]);
  return res.rows[0] ? res.rows[0].id : null;
}
async function run() {
  const login = 'admin_test';
  const uid = await getUserId(login);
  if (!uid) throw new Error('admin_test user not found; run seedAdmin.js');
  const statusId = await orderService.findPaymentStatusIdByName('Оплачен полностью');
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const dateIso = d.toISOString().slice(0, 10);
  const order = {
    fulfillment_type: 'pickup',
    store_name: 'Северный',
    execution_date: dateIso,
    execution_time: '12:00',
    order_type: 'wedding',
    creator_full_name: 'Тест Админ',
    details: { composition: 'Розы' },
    photos: ['photo1'],
    contacts: { client_name: 'Иван', client_phone: '+7000' },
    card_photo: null,
    payment_status_id: statusId,
    total_cost: 1000,
    paid_amount: 1000,
  };
  const id = await orderService.createOrder(uid, order);
  await processDueReminders();
  const rem = await pool.query('SELECT trigger_type, sent FROM reminders WHERE order_id=$1 ORDER BY trigger_type', [id]);
  const orow = await orderService.getOrderWithDetails(id);
  console.log('order_id:', id);
  console.log('reminders:', rem.rows.map(r => `${r.trigger_type}:${r.sent ? 'sent' : 'pending'}`));
  console.log('channels:', sentChannels.map(c => `${c.channelId}`));
  console.log('order_summary_payment:', `${orow.payment_status_name}|${orow.total_cost}|${orow.paid_amount}`);
  process.exit(0);
}
run().catch((e) => {
  console.error('test db error', e);
  process.exit(1);
});
