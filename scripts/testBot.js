const path = require('path');

function stubModule(relPath, stub) {
  const full = path.resolve(__dirname, relPath);
  const key = require.resolve(full);
  delete require.cache[key];
  require.cache[key] = { exports: stub };
}

const sentChannels = [];
const editedMessages = [];
let nextMessageId = 5000;
stubModule('../services/telegramService.js', {
  initializeBot: () => null,
  getBot: () => null,
  sendToChannel: async (channelId, message, options = {}) => {
    const msgId = nextMessageId++;
    sentChannels.push({ channelId: String(channelId), message, options, message_id: msgId });
    return { message_id: msgId };
  },
  editMessageInChannel: async (channelId, messageId, newText, options = {}) => {
    editedMessages.push({ channelId: String(channelId), messageId, newText, options });
    return true;
  },
  sendDocumentToChannel: async () => {},
  sendPhotoToChannel: async () => ({ message_id: nextMessageId++ }),
  sendMediaGroupToChannel: async () => ({ ok: true }),
});

const adminUser = { id: 1, login: 'admin', rights_id: 2, rights_name: 'администратор', password: '$2stub' };
stubModule('../services/userService.js', {
  findUserByLogin: async (login) => (login === 'admin' ? adminUser : null),
  verifyPassword: async (user, password) => user && password === 'admin123',
  createUser: async () => ({ id: 2 }),
  getAllRights: async () => [{ id: 1, name: 'сотрудник' }, { id: 2, name: 'администратор' }],
  listAllUsers: async () => [{ id: 1, login: 'admin', rights_id: 2, rights_name: 'администратор' }],
  updateUserPassword: async () => true,
  deleteUser: async () => true,
  updateUserRights: async () => true,
  findRightsIdByName: async (name) => (name === 'администратор' ? 2 : 1),
});

let nextOrderId = 1000;
const createdOrders = [];
const messageMap = new Map(); // key: `${orderId}:${kind}` -> { chat_id, message_id }
stubModule('../services/orderService.js', {
  findAddressIdByName: async () => 1,
  getOrderTypeCalledByName: async (name) => {
    const s = String(name || '').toLowerCase();
    if (s === 'wedding') return 'Свадебный букет';
    if (s === 'composition') return 'Композиция';
    if (s === 'food') return 'Еда';
    if (s === 'flowers_food') return 'Цветы + еда';
    return 'Другое';
  },
  findPaymentStatusIdByName: async (name) => {
    if (name === 'Оплачен полностью') return 1;
    if (name === 'Оплачен частично') return 2;
    if (name === 'Не оплачен') return 3;
    return 0;
  },
  createOrder: async (userId, order) => {
    const id = nextOrderId++;
    createdOrders.push({ id, userId, order, kind: 'create' });
    return id;
  },
  createOrderDraft: async (userId, order) => {
    const id = nextOrderId++;
    createdOrders.push({ id, userId, order, kind: 'draft' });
    return id;
  },
  updateOrderAndActivate: async (orderId, order) => {
    createdOrders.push({ id: orderId, order, kind: 'update' });
    return true;
  },
  listActiveOrders: async () => [],
  listActiveOrdersByAddress: async (addressId, limit) => [
    { id: 5001, execution_date: new Date().toISOString().slice(0, 10), execution_time: '09:00', order_type: 'composition', address_name: 'Строитель' }
  ],
  getOrderWithDetails: async (id) => ({
    id,
    fulfillment_type: 'pickup',
    address_name: 'Северный',
    execution_date: new Date().toISOString().slice(0, 10),
    execution_time: '12:00',
    order_type: 'wedding',
    creator_full_name: 'Тест',
    total_cost: 1000,
    paid_amount: 1000,
    payment_status_name: 'Оплачен полностью',
    client_name: 'Иван',
    client_phone: '123',
    recipient_name: 'Петр',
    recipient_phone: '456',
    recipient_address: 'Адрес',
    photos: [],
    card_photo: id === 5001 ? 'card_photo_view' : undefined,
  }),
  completeOrder: async () => true,
  cancelOrder: async () => true,
  deleteOrder: async () => true,
  upsertOrderChannelMessage: async (orderId, kind, chatId, messageId) => {
    messageMap.set(`${orderId}:${String(kind)}`, { chat_id: String(chatId), message_id: parseInt(messageId, 10) });
    return true;
  },
  getOrderChannelMessages: async (orderId) => {
    const keys = ['address', 'admin'];
    const rows = [];
    for (const k of keys) {
      const v = messageMap.get(`${orderId}:${k}`);
      if (v) rows.push({ kind: k, chat_id: v.chat_id, message_id: v.message_id });
    }
    return rows;
  },
});

process.env.ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1003345446030';
process.env.ORDER_CHANNEL_ID = '-1003406397214';
process.env.REPORT_CHANNEL_ID = '-1003406397214';
process.env.WEB_APP_URL = 'https://example.com/app';

const { handleStart, handleMessage, setUserState, getUserState, clearUserState } = require('../bot/handlers/auth');
const { handleMainMenu } = require('../bot/handlers/menu');
const { handleOrderCreate, handleOrderManage, handleCallback, handleOrderMessage, handleConfirmOrEdit } = require('../bot/handlers/order');

class MockBot {
  constructor() {
    this.messages = [];
    this.photos = [];
  }
  async sendMessage(chatId, text, options) {
    this.messages.push({ chatId, text, options });
    return { ok: true };
  }
  async sendPhoto(chatId, fileId, options) {
    this.photos.push({ chatId, fileId, options });
    return { ok: true };
  }
}

const bot = new MockBot();
const userId = 12345;
const chatId = 999;
const ctx = { chat: { id: chatId }, from: { id: userId } };

function lastMessageContains(substr) {
  const m = bot.messages[bot.messages.length - 1];
  return m && typeof m.text === 'string' && m.text.includes(substr);
}

async function testAuthFlow() {
  await handleStart(bot, { chat: { id: chatId }, from: { id: userId } });
  await handleMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'nouser' });
  await handleStart(bot, { chat: { id: chatId }, from: { id: userId } });
  await handleMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'admin' });
  await handleMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'wrong' });
  await handleStart(bot, { chat: { id: chatId }, from: { id: userId } });
  await handleMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'admin' });
  await handleMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'admin123' });
}

async function testMainMenu() {
  await handleMainMenu(bot, { chat: { id: chatId }, from: { id: userId } });
}

function setDraftState(draft, details, contacts, photos, orderId) {
  setUserState(userId, 'order_confirm', {
    user: adminUser,
    draft,
    details: details || {},
    contacts: contacts || {},
    photos: photos || [],
    card_photo: draft.card_photo || null,
    order_id: orderId,
  });
}

async function testConfirmScenarioPickupWeddingFull() {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const draft = {
    fulfillment_type: 'pickup',
    store_name: 'Северный',
    execution_date: tomorrow,
    execution_time: '12:00',
    order_type: 'wedding',
    creator_name: 'Иван Иванов',
    total_cost: 1000,
    paid_amount: 1000,
    payment_status_name: 'Оплачен полностью',
  };
  const details = { composition: 'Розы, пионы', has_boutonniere: true, comment: 'Без опозданий' };
  const contacts = { client_name: 'Иван', client_phone: '+7-999-000-11-22' };
  setDraftState(draft, details, contacts, ['photo1', 'photo2']);
  await handleConfirmOrEdit(bot, ctx, 'order_confirm');
}

async function testConfirmScenarioDeliveryCompositionPartial() {
  const dateIso = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  process.env.ORDER_CHANNEL_ID = '-1001600945854';
  const draft = {
    fulfillment_type: 'delivery',
    store_name: 'Строитель',
    execution_date: dateIso,
    execution_time: '10:00',
    order_type: 'composition',
    creator_name: 'Петр Петров',
    total_cost: 2000,
    paid_amount: 500,
    payment_status_name: 'Оплачен частично',
    card_photo: 'card_photo_1',
  };
  const details = { composition_kind: 'bouquet', composition: 'Гортензии', card_text: '', comment: 'Позвонить за 30 минут' };
  const contacts = { client_name: 'Мария', client_phone: '88005553535', recipient_name: 'Ольга', recipient_phone: '89991231234', recipient_address: 'ул. Примерная, 1' };
  setDraftState(draft, details, contacts, ['ph1']);
  await handleConfirmOrEdit(bot, ctx, 'order_confirm');
}

async function testConfirmScenarioFoodNone() {
  const dateIso = new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 10);
  process.env.ORDER_CHANNEL_ID = '123';
  const draft = {
    fulfillment_type: 'pickup',
    store_name: 'Белгород',
    execution_date: dateIso,
    execution_time: '15:00',
    order_type: 'food',
    total_cost: 1500,
    paid_amount: 0,
    payment_status_name: 'Не оплачен',
  };
  const details = { composition: 'Сет закусок' };
  const contacts = { client_name: 'Алексей', client_phone: '7000' };
  setDraftState(draft, details, contacts, []);
  await handleConfirmOrEdit(bot, ctx, 'order_confirm');
}

async function testCreateDeliveryWithFee() {
  const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  const dd = String(future.getDate()).padStart(2, '0');
  const mm = String(future.getMonth() + 1).padStart(2, '0');
  const yyyy = future.getFullYear();
  const dateText = `${dd}.${mm}.${yyyy}`;
  await handleOrderCreate(bot, { chat: { id: chatId }, from: { id: userId } });
  await handleCallback(bot, ctx, 'order_fulfillment_delivery');
  await handleCallback(bot, ctx, 'order_store_Белгород');
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'Петр Петров' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: dateText });
  await handleCallback(bot, ctx, 'order_time_10:00');
  await handleCallback(bot, ctx, 'order_type_composition');
  await handleCallback(bot, ctx, 'order_comp_bouquet');
  await handleCallback(bot, ctx, 'order_next');
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'Мария' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '+7-999-000-11-22' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'Ольга' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '89991231234' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'ул. Примерная, 1' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'Позвонить за 30 минут' });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '350' });
  await handleCallback(bot, ctx, 'delivery_paid_yes');
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '2000' });
  await handleCallback(bot, ctx, 'payment_partial');
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '500' });
  await handleConfirmOrEdit(bot, ctx, 'order_confirm');
  const hasDeliveryCost = bot.messages.some(m => typeof m.text === 'string' && m.text.includes('Стоимость доставки: 350.00 ₽'));
  const hasDeliveryPaid = bot.messages.some(m => typeof m.text === 'string' && m.text.includes('Оплата доставки: оплачено'));
  if (hasDeliveryCost && hasDeliveryPaid) console.log('[OK] CreateDeliveryWithFee'); else console.error('[FAIL] CreateDeliveryWithFee');
}
async function testParseFailures() {
  setUserState(userId, 'order_date_text', { user: adminUser, draft: {} });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: '31.02.2025' });
  setUserState(userId, 'order_payment_cost', { user: adminUser, draft: {}, details: {}, photos: [], contacts: {} });
  await handleOrderMessage(bot, { chat: { id: chatId }, from: { id: userId }, text: 'abc' });
}

async function testInterruptFlow() {
  setUserState(userId, 'order_store', { user: adminUser, draft: { fulfillment_type: 'pickup' } });
  await handleCallback(bot, ctx, 'interrupt_order_delete');
}

async function run() {
  const sections = [
    { name: 'Auth', fn: testAuthFlow },
    { name: 'MainMenu', fn: testMainMenu },
    { name: 'ConfirmPickupWeddingFull', fn: testConfirmScenarioPickupWeddingFull },
    { name: 'ConfirmDeliveryCompositionPartial', fn: testConfirmScenarioDeliveryCompositionPartial },
    { name: 'ConfirmFoodNone', fn: testConfirmScenarioFoodNone },
    { name: 'CreateDeliveryWithFee', fn: testCreateDeliveryWithFee },
    { name: 'ParseFailures', fn: testParseFailures },
    { name: 'InterruptFlow', fn: testInterruptFlow },
    { name: 'ManageOrdersByAddress', fn: async () => {
      await handleOrderManage(bot, { chat: { id: chatId }, from: { id: userId } });
      await handleCallback(bot, ctx, 'order_manage_addr_Строитель');
      await handleCallback(bot, ctx, 'order_view_5001');
      const hasCardPhoto = bot.photos.some(p => p.fileId === 'card_photo_view');
      if (hasCardPhoto) console.log('[OK] ManageOrdersCardPhotoShown'); else console.error('[FAIL] ManageOrdersCardPhotoShown');
    } },
  ];
  for (const s of sections) {
    try {
      await s.fn();
      console.log(`[OK] ${s.name}`);
    } catch (e) {
      console.error(`[FAIL] ${s.name}`, e);
    }
  }
  // Вывод кратких результатов
  console.log('Messages count:', bot.messages.length);
  console.log('Channel sends:', sentChannels.map(c => `${c.channelId}`));
  console.log('Orders touched:', createdOrders.map(o => `${o.kind}:${o.id}`));
  // Доп. проверка редактирования сообщений по заказу
  try {
    const orderService = require('../services/orderService.js');
    const oid = 3000;
    await orderService.upsertOrderChannelMessage(oid, 'address', '-1002396751671', 6000);
    await orderService.upsertOrderChannelMessage(oid, 'admin', '-1003345446030', 6001);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const draft = { fulfillment_type: 'pickup', store_name: 'Северный', execution_date: tomorrow, execution_time: '14:00', order_type: 'wedding' };
    const details = { composition: 'Тест состав' };
    const contacts = { client_name: 'Тест', client_phone: '000' };
    setDraftState(draft, details, contacts, [], oid);
    await handleConfirmOrEdit(bot, ctx, 'order_confirm');
    if (editedMessages.length >= 2) {
      console.log('[OK] ConfirmEditUpdatesMessages');
    } else {
      console.error('[FAIL] ConfirmEditUpdatesMessages', 'no edits recorded');
    }
  } catch (e) {
    console.error('[FAIL] ConfirmEditUpdatesMessages', e);
  }
}

run().catch((e) => {
  console.error('test runner error', e);
  process.exit(1);
});
