const { getUserState, setUserState } = require('./auth');
const reportService = require('../../services/reportService');
const orderService = require('../../services/orderService');
const { showOrderDetailByOrderId } = require('./order');

const FILTER_PAGE_SIZE = 10;

const FILTER_STATUS_LABELS = {
  assembled: 'Собран',
  accepted: 'Принят',
  processing: 'В обработке',
  active: 'Активен',
};

function toDateObj(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

function formatDateDDMM(val) {
  const d = toDateObj(val);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function orderStatusEmoji(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'assembled') return '📦';
  if (s === 'accepted') return '✅';
  if (s === 'processing') return '⚠️';
  if (s === 'active') return '✅';
  return '✅';
}

function formatTimeHM(val) {
  const s = String(val || '');
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

async function handleFiltersStart(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  if (userState.state !== 'authenticated') {
    await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
    return;
  }
  const inline_keyboard = [
    [{ text: 'По типу заказа', callback_data: 'filter_mode_type' }],
    [{ text: 'По статусу заказа', callback_data: 'filter_mode_status' }],
    [{ text: 'По номеру заказа', callback_data: 'filter_mode_number' }],
    [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
  ];
  await bot.sendMessage(chatId, 'Выберите способ фильтрации:', { reply_markup: { inline_keyboard } });
}

/** Show address selection for "filter by status" flow (filter_addr_*). */
async function showFilterAddressSelection(bot, chatId, userId) {
  const userState = getUserState(userId);
  const rn = String((userState.data.user || {}).rights_name || '').toLowerCase();
  const isDev = rn === 'разработчик';
  let addresses = await reportService.listAddresses();
  if (!isDev) {
    addresses = (addresses || []).filter((a) => Number(a.id) !== -7 && String(a.name || '').toLowerCase() !== 'тестовый магазин');
  }
  setUserState(userId, 'filter_address', { user: userState.data.user });
  const rows = (addresses || []).map((a) => [{ text: a.name, callback_data: `filter_addr_${a.id}` }]);
  rows.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  await bot.sendMessage(chatId, 'Выберите адрес:', { reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет адресов', callback_data: 'noop' }]] } });
}

/** Show address selection for "filter by type" flow (filter_type_addr_*). */
async function showFilterTypeAddressSelection(bot, chatId, userId) {
  const userState = getUserState(userId);
  const rn = String((userState.data.user || {}).rights_name || '').toLowerCase();
  const isDev = rn === 'разработчик';
  let addresses = await reportService.listAddresses();
  if (!isDev) {
    addresses = (addresses || []).filter((a) => Number(a.id) !== -7 && String(a.name || '').toLowerCase() !== 'тестовый магазин');
  }
  setUserState(userId, 'filter_type_address', { user: userState.data.user });
  const rows = (addresses || []).map((a) => [{ text: a.name, callback_data: `filter_type_addr_${a.id}` }]);
  rows.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  await bot.sendMessage(chatId, 'Выберите адрес:', { reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет адресов', callback_data: 'noop' }]] } });
}

async function handleFilterAddress(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  const addressId = parseInt(data.replace('filter_addr_', ''), 10);
  if (!Number.isFinite(addressId)) {
    await bot.sendMessage(chatId, 'Некорректный адрес.');
    return;
  }
  const rn = String(((st.data && st.data.user) || {}).rights_name || '').toLowerCase();
  const isDev = rn === 'разработчик';
  if (addressId === -7 && !isDev) {
    await bot.sendMessage(chatId, '❌ У вас нет доступа к этому адресу.');
    return;
  }
  const addressName = await orderService.getAddressNameById(addressId) || `Адрес ${addressId}`;
  setUserState(userId, 'filter_status', {
    user: st.data && st.data.user,
    filter_address_id: addressId,
    filter_address_name: addressName,
  });
  const inline_keyboard = [
    [{ text: '📦 Собран', callback_data: 'filter_status_assembled' }],
    [{ text: '✅ Принят', callback_data: 'filter_status_accepted' }],
    [{ text: '⚠️ В обработке', callback_data: 'filter_status_processing' }],
    [{ text: '✅ Активен', callback_data: 'filter_status_active' }],
    [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
  ];
  await bot.sendMessage(chatId, 'Выберите статус:', { reply_markup: { inline_keyboard } });
}

async function handleFilterStatus(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  const status = data.replace('filter_status_', '');
  if (!['assembled', 'accepted', 'processing', 'active'].includes(status)) {
    await bot.sendMessage(chatId, 'Некорректный статус.');
    return;
  }
  const d = st.data || {};
  setUserState(userId, 'filter_list', {
    user: d.user,
    filter_address_id: d.filter_address_id,
    filter_address_name: d.filter_address_name || '',
    filter_status: status,
    filter_page: 1,
    filter_message_id: null,
  });
  await showFilterListPage(bot, chatId, userId, null);
}

async function showFilterListPage(bot, chatId, userId, messageId) {
  const st = getUserState(userId);
  const data = st && st.data ? st.data : {};
  const addressId = data.filter_address_id;
  const addressName = data.filter_address_name || '';
  const status = data.filter_status;
  const page = data.filter_page && data.filter_page > 0 ? data.filter_page : 1;
  if (addressId == null || !status) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и статус.');
    return;
  }
  const offset = (page - 1) * FILTER_PAGE_SIZE;
  const list = await orderService.listOrdersByAddressAndStatusPage(addressId, status, FILTER_PAGE_SIZE + 1, offset);
  const statusLabel = FILTER_STATUS_LABELS[status] || status;
  if (!list.length) {
    await bot.sendMessage(chatId, `Заказов по адресу "${addressName}" со статусом "${statusLabel}" нет.`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'back_menu' }]] },
    });
    return;
  }
  const hasMore = list.length > FILTER_PAGE_SIZE;
  const slice = hasMore ? list.slice(0, FILTER_PAGE_SIZE) : list;
  const inline_keyboard = slice.map((o) => {
    const num = o.number || o.id;
    const count = o.positions_count || 1;
    const suffix = count > 1 ? ` (${count} поз.)` : '';
    const emoji = orderStatusEmoji(o.status);
    const dateStr = formatDateDDMM(o.execution_date);
    const timeStr = formatTimeHM(o.execution_time || '');
    const btnText = `${emoji} №${num}${suffix} ${dateStr} ${timeStr}`.trim();
    return [{ text: btnText, callback_data: `order_view_${o.id}` }];
  });
  const navRow = [];
  if (page > 1) {
    navRow.push({ text: '◀ Назад', callback_data: 'filter_prev' });
  }
  if (hasMore) {
    navRow.push({ text: 'Вперёд ▶', callback_data: 'filter_next' });
  }
  if (navRow.length) {
    inline_keyboard.push(navRow);
  }
  inline_keyboard.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  const text = `Заказы: ${addressName}, статус ${statusLabel}`;
  const opts = { reply_markup: { inline_keyboard } };
  if (messageId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } catch (e) {
      const msg = String((e && e.message) || '').toLowerCase();
      if (!msg.includes('message is not modified')) {
        throw e;
      }
    }
    return null;
  }
  const msg = await bot.sendMessage(chatId, text, opts);
  const msgId = msg && msg.message_id ? msg.message_id : null;
  if (msgId) {
    const cur = getUserState(userId);
    const curData = cur && cur.data ? cur.data : {};
    setUserState(userId, 'filter_list', {
      user: curData.user,
      filter_address_id: curData.filter_address_id,
      filter_address_name: curData.filter_address_name,
      filter_status: curData.filter_status,
      filter_page: curData.filter_page || 1,
      filter_message_id: msgId,
    });
  }
  return msg;
}

async function handleFilterPrev(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const cur = getUserState(userId);
  const d = cur && cur.data ? cur.data : {};
  const addressId = d.filter_address_id;
  if (addressId == null) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и статус.');
    return;
  }
  const currentPage = d.filter_page || 1;
  const prevPage = currentPage > 1 ? currentPage - 1 : 1;
  setUserState(userId, 'filter_list', {
    user: d.user,
    filter_address_id: addressId,
    filter_address_name: d.filter_address_name || '',
    filter_status: d.filter_status,
    filter_page: prevPage,
    filter_message_id: d.filter_message_id || null,
  });
  await showFilterListPage(bot, chatId, userId, d.filter_message_id || null);
}

async function handleFilterModeStatus(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  await showFilterAddressSelection(bot, chatId, userId);
}

async function handleFilterModeType(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  await showFilterTypeAddressSelection(bot, chatId, userId);
}

async function handleFilterModeNumber(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  if (userState.state !== 'authenticated') {
    await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
    return;
  }
  setUserState(userId, 'filter_by_number', { user: userState.data.user });
  await bot.sendMessage(chatId, 'Введите номер заказа (число):', {
    reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'back_menu' }]] },
  });
}

async function handleFilterTypeAddress(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  const addressId = parseInt(data.replace('filter_type_addr_', ''), 10);
  if (!Number.isFinite(addressId)) {
    await bot.sendMessage(chatId, 'Некорректный адрес.');
    return;
  }
  const rn = String(((st.data && st.data.user) || {}).rights_name || '').toLowerCase();
  const isDev = rn === 'разработчик';
  if (addressId === -7 && !isDev) {
    await bot.sendMessage(chatId, '❌ У вас нет доступа к этому адресу.');
    return;
  }
  const addressName = await orderService.getAddressNameById(addressId) || `Адрес ${addressId}`;
  setUserState(userId, 'filter_type_fulfillment', {
    user: st.data && st.data.user,
    filter_type_address_id: addressId,
    filter_type_address_name: addressName,
  });
  const inline_keyboard = [
    [{ text: 'Доставка', callback_data: 'filter_type_delivery' }],
    [{ text: 'Самовывоз', callback_data: 'filter_type_pickup' }],
    [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
  ];
  await bot.sendMessage(chatId, 'Выберите тип получения:', { reply_markup: { inline_keyboard } });
}

async function handleFilterTypeFulfillment(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  const fulfillmentType = data === 'filter_type_delivery' ? 'delivery' : data === 'filter_type_pickup' ? 'pickup' : null;
  if (!fulfillmentType) {
    await bot.sendMessage(chatId, 'Некорректный выбор.');
    return;
  }
  const d = st.data || {};
  setUserState(userId, 'filter_type_list', {
    user: d.user,
    filter_type_address_id: d.filter_type_address_id,
    filter_type_address_name: d.filter_type_address_name || '',
    filter_type_fulfillment: fulfillmentType,
    filter_type_page: 1,
    filter_type_message_id: null,
  });
  await showFilterByTypeListPage(bot, chatId, userId, null);
}

async function showFilterByTypeListPage(bot, chatId, userId, messageId) {
  const st = getUserState(userId);
  const data = st && st.data ? st.data : {};
  const addressId = data.filter_type_address_id;
  const addressName = data.filter_type_address_name || '';
  const fulfillmentType = data.filter_type_fulfillment;
  const page = data.filter_type_page && data.filter_type_page > 0 ? data.filter_type_page : 1;
  if (addressId == null || !fulfillmentType) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и тип получения.');
    return;
  }
  const offset = (page - 1) * FILTER_PAGE_SIZE;
  const list = await orderService.listOrdersByAddressAndFulfillmentPage(addressId, fulfillmentType, FILTER_PAGE_SIZE + 1, offset);
  const typeLabel = fulfillmentType === 'delivery' ? 'Доставка' : 'Самовывоз';
  if (!list.length) {
    await bot.sendMessage(chatId, `Заказов по адресу "${addressName}" с типом "${typeLabel}" нет.`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'back_menu' }]] },
    });
    return;
  }
  const hasMore = list.length > FILTER_PAGE_SIZE;
  const slice = hasMore ? list.slice(0, FILTER_PAGE_SIZE) : list;
  const inline_keyboard = slice.map((o) => {
    const num = o.number || o.id;
    const count = o.positions_count || 1;
    const suffix = count > 1 ? ` (${count} поз.)` : '';
    const emoji = orderStatusEmoji(o.status);
    const dateStr = formatDateDDMM(o.execution_date);
    const timeStr = formatTimeHM(o.execution_time || '');
    const btnText = `${emoji} №${num}${suffix} ${dateStr} ${timeStr}`.trim();
    return [{ text: btnText, callback_data: `order_view_${o.id}` }];
  });
  const navRow = [];
  if (page > 1) {
    navRow.push({ text: '◀ Назад', callback_data: 'filter_type_prev' });
  }
  if (hasMore) {
    navRow.push({ text: 'Вперёд ▶', callback_data: 'filter_type_next' });
  }
  if (navRow.length) {
    inline_keyboard.push(navRow);
  }
  inline_keyboard.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  const text = `Заказы: ${addressName}, ${typeLabel}`;
  const opts = { reply_markup: { inline_keyboard } };
  if (messageId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } catch (e) {
      const msg = String((e && e.message) || '').toLowerCase();
      if (!msg.includes('message is not modified')) {
        throw e;
      }
    }
    return null;
  }
  const msg = await bot.sendMessage(chatId, text, opts);
  const msgId = msg && msg.message_id ? msg.message_id : null;
  if (msgId) {
    const cur = getUserState(userId);
    const curData = cur && cur.data ? cur.data : {};
    setUserState(userId, 'filter_type_list', {
      user: curData.user,
      filter_type_address_id: curData.filter_type_address_id,
      filter_type_address_name: curData.filter_type_address_name,
      filter_type_fulfillment: curData.filter_type_fulfillment,
      filter_type_page: curData.filter_type_page || 1,
      filter_type_message_id: msgId,
    });
  }
  return msg;
}

async function handleFilterTypePrev(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const cur = getUserState(userId);
  const d = cur && cur.data ? cur.data : {};
  const addressId = d.filter_type_address_id;
  if (addressId == null) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и тип получения.');
    return;
  }
  const currentPage = d.filter_type_page || 1;
  const prevPage = currentPage > 1 ? currentPage - 1 : 1;
  setUserState(userId, 'filter_type_list', {
    user: d.user,
    filter_type_address_id: addressId,
    filter_type_address_name: d.filter_type_address_name || '',
    filter_type_fulfillment: d.filter_type_fulfillment,
    filter_type_page: prevPage,
    filter_type_message_id: d.filter_type_message_id || null,
  });
  await showFilterByTypeListPage(bot, chatId, userId, d.filter_type_message_id || null);
}

async function handleFilterTypeNext(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const cur = getUserState(userId);
  const d = cur && cur.data ? cur.data : {};
  const addressId = d.filter_type_address_id;
  if (addressId == null) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и тип получения.');
    return;
  }
  const nextPage = (d.filter_type_page || 1) + 1;
  setUserState(userId, 'filter_type_list', {
    user: d.user,
    filter_type_address_id: addressId,
    filter_type_address_name: d.filter_type_address_name || '',
    filter_type_fulfillment: d.filter_type_fulfillment,
    filter_type_page: nextPage,
    filter_type_message_id: d.filter_type_message_id || null,
  });
  await showFilterByTypeListPage(bot, chatId, userId, d.filter_type_message_id || null);
}

async function handleFilterByNumberMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || '').trim();
  const num = parseInt(text, 10);
  if (!Number.isFinite(num) || num < 1) {
    await bot.sendMessage(chatId, 'Введите число — номер заказа (например, 1194).');
    return;
  }
  let orders;
  try {
    orders = await orderService.getOrdersByNumber(num);
  } catch (e) {
    await bot.sendMessage(chatId, 'Заказ с таким номером не найден.');
    const userState = getUserState(userId);
    const user = (userState.data && userState.data.user) || null;
    setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
    return;
  }
  if (!orders || orders.length === 0) {
    await bot.sendMessage(chatId, 'Заказ с таким номером не найден.');
    const userState = getUserState(userId);
    const user = (userState.data && userState.data.user) || null;
    setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
    return;
  }
  const orderId = orders[0].id;
  await showOrderDetailByOrderId(bot, chatId, userId, orderId);
  const userState = getUserState(userId);
  const user = (userState.data && userState.data.user) || null;
  setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
}

async function handleFilterNext(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const cur = getUserState(userId);
  const d = cur && cur.data ? cur.data : {};
  const addressId = d.filter_address_id;
  if (addressId == null) {
    await bot.sendMessage(chatId, 'Сначала выберите адрес и статус.');
    return;
  }
  const nextPage = (d.filter_page || 1) + 1;
  setUserState(userId, 'filter_list', {
    user: d.user,
    filter_address_id: addressId,
    filter_address_name: d.filter_address_name || '',
    filter_status: d.filter_status,
    filter_page: nextPage,
    filter_message_id: d.filter_message_id || null,
  });
  await showFilterListPage(bot, chatId, userId, d.filter_message_id || null);
}

module.exports = {
  handleFiltersStart,
  handleFilterAddress,
  handleFilterStatus,
  handleFilterPrev,
  handleFilterNext,
  showFilterListPage,
  handleFilterModeStatus,
  handleFilterModeType,
  handleFilterModeNumber,
  handleFilterTypeAddress,
  handleFilterTypeFulfillment,
  handleFilterTypePrev,
  handleFilterTypeNext,
  handleFilterByNumberMessage,
};
