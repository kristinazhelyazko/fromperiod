const { getUserState, setUserState, clearUserState } = require('./auth');
const logger = require('../../utils/logger');
const {
  getFulfillmentKeyboard,
  getStoreKeyboard,
  getTimeKeyboard,
  getTimeKeyboardForDate,
  getOrderTypeKeyboard,
  getNextKeyboard,
  getMainMenuKeyboard,
  getYesNoKeyboard,
  getPaymentStatusKeyboard,
  getInterruptOrderKeyboard,
} = require('../keyboards');
const orderService = require('../../services/orderService');
const { sendToChannel, editMessageInChannel, sendPhotoToChannel, sendMediaGroupToChannel } = require('../../services/telegramService');
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1003345446030';
const ORDER_CHANNEL_MAP = {
  'Белгород': '-1003868788094',
  'Строитель': '-1002136516687',
  'Северный': '-1002144814016',
  'Тестовый магазин': '-5159177330',
};
function isValidChannelId(id) {
  const s = String(id || '');
  return /^-\d+$/.test(s);
}
function resolveChannelForStore(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  if (n === 'белгород') return ORDER_CHANNEL_MAP['Белгород'];
  if (n === 'строитель') return ORDER_CHANNEL_MAP['Строитель'];
  if (n === 'северный') return ORDER_CHANNEL_MAP['Северный'];
  if (n === 'тестовый магазин') return ORDER_CHANNEL_MAP['Тестовый магазин'];
  return ORDER_CHANNEL_MAP[name] || null;
}
function isTestStoreName(name) {
  return String(name || '').trim().toLowerCase() === 'тестовый магазин';
}

function toDateObj(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

function orderTypeRu(t) {
  const s = String(t || '').toLowerCase();
  if (s === 'wedding') return 'Свадебный букет';
  if (s === 'composition') return 'Композиция';
  if (s === 'food') return 'Еда';
  if (s === 'flowers_food') return 'Цветы + еда';
  if (s === 'test') return 'Тестовый заказ';
  return 'Другое';
}

function detailKeyToRu(key) {
  const k = String(key || '');
  if (k === 'execution_date') return 'Дата';
  if (k === 'execution_time') return 'Время';
  if (k === 'store_name') return 'Магазин';
  if (k === 'order_type') return 'Тип заказа';
  if (k === 'total_cost') return 'Стоимость';
  if (k === 'payment_status') return 'Статус оплаты';
  if (k === 'paid_amount') return 'Оплачено';
  if (k === 'composition_kind') return 'Тип композиции';
  if (k === 'composition') return 'Состав';
  if (k === 'card_text') return 'Текст открытки';
  if (k === 'has_boutonniere') return 'Бутоньерка';
  if (k === 'description') return 'Описание';
  if (k === 'comment') return 'Комментарий';
  if (k === 'creator_name') return 'ФИО оформителя';
  if (k === 'client_name') return 'Имя клиента';
  if (k === 'client_phone') return 'Телефон клиента';
  if (k === 'recipient_name') return 'Имя получателя';
  if (k === 'recipient_phone') return 'Телефон получателя';
  if (k === 'recipient_address') return 'Адрес получателя';
  return k;
}

function buildEditKeyboardFromState(stData) {
  const keys = [];
  const d = stData.draft || {};
  const det = stData.details || {};
  const c = stData.contacts || {};
  if (d.execution_date) keys.push('execution_date');
  if (d.execution_time) keys.push('execution_time');
  if (d.store_name) keys.push('store_name');
  if (d.order_type) keys.push('order_type');
  if (typeof d.total_cost !== 'undefined') keys.push('total_cost');
  if (d.payment_status_id || d.payment_status_name) keys.push('payment_status');
  if (typeof d.paid_amount !== 'undefined') keys.push('paid_amount');
  if (det.composition_kind) keys.push('composition_kind');
  if (det.composition) keys.push('composition');
  if (det.card_text) keys.push('card_text');
  if (typeof det.has_boutonniere === 'boolean') keys.push('has_boutonniere');
  if (det.description) keys.push('description');
  if (det.comment) keys.push('comment');
  if (c.client_name) keys.push('client_name');
  if (c.client_phone) keys.push('client_phone');
  if (c.recipient_name) keys.push('recipient_name');
  if (c.recipient_phone) keys.push('recipient_phone');
  if (c.recipient_address) keys.push('recipient_address');
  const rows = keys.map(k => [{ text: detailKeyToRu(k), callback_data: `order_edit_key_${k}` }]);
  const typeStr = String(d.order_type || '');
  if (typeStr === 'wedding' || typeStr === 'composition' || typeStr === 'flowers_food' || typeStr === 'other') {
    rows.unshift([{ text: 'Фотографии', callback_data: 'order_edit_photos' }]);
  }
  rows.push([{ text: '⬅️ Назад', callback_data: 'order_edit_back' }]);
  rows.push([{ text: '❌ Отмена', callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

async function showConfirm(bot, userId, chatId, stData) {
  const draft = stData.draft || {};
  const details = stData.details || {};
  const photos = stData.photos || [];
  const contacts = stData.contacts || {};
  let orderId = stData.order_id;
  let createdDraft = false;
  if (!orderId) {
     try {
      const ready =
        !!draft.fulfillment_type &&
        !!draft.store_name &&
        !!draft.execution_date &&
        !!draft.execution_time &&
        !!draft.order_type;
      if (ready) {
        orderId = await orderService.createOrderDraft(stData.user.id, {
          fulfillment_type: draft.fulfillment_type,
          store_name: draft.store_name,
          execution_date: draft.execution_date,
          execution_time: draft.execution_time,
          order_type: draft.order_type,
          creator_full_name: draft.creator_name || null,
          details,
          photos,
          contacts,
          card_photo: stData.card_photo || null,
          payment_status_id: draft.payment_status_id || null,
          total_cost: draft.total_cost || 0,
          paid_amount: draft.paid_amount || 0,
        });
        createdDraft = true;
      }
    } catch (e) {
      logger.error('showConfirm create draft error', e);
    }
  }
  let typeCalled = '';
  if (draft.order_type) {
    try {
      typeCalled = await orderService.getOrderTypeCalledByName(draft.order_type) || '';
    } catch (_) {}
  }
  const summary = buildSummary(draft, details, photos, contacts, stData.card_photo || null, orderId, typeCalled);
  setUserState(userId, 'order_confirm', { user: stData.user, draft, details, photos, contacts, card_photo: stData.card_photo || null, order_id: orderId, created_from_draft: createdDraft || stData.created_from_draft || false });
  const delRow = orderId ? [[{ text: '🗑️ Удалить заказ', callback_data: `order_delete_${orderId}` }]] : [];
  const kb = { reply_markup: { inline_keyboard: [[{ text: '✅ Все корректно', callback_data: 'order_confirm' }],[{ text: '✏️ Внести изменения', callback_data: 'order_edit' }], ...delRow] } };
  await bot.sendMessage(chatId, summary);
  await bot.sendMessage(chatId, 'Подтверждение заказа:', kb);
}

function formatDateRu(val) {
  const d = toDateObj(val);
  if (!d || Number.isNaN(d.getTime())) return String(val || '');
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatTimeHM(val) {
  const s = String(val || '');
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}
function parseMoney(text) {
  const s = String(text || '').replace(/\s/g, '').replace(',', '.');
  const val = parseFloat(s);
  if (!Number.isFinite(val) || val < 0) return { ok: false, message: 'Некорректная сумма. Введите число.' };
  return { ok: true, value: Math.round(val * 100) / 100 };
}
function formatMoney(val) {
  const n = Number(val || 0);
  return n.toFixed(2);
}
function parseDateDDMMYYYY(text) {
  const m = (text || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return { ok: false, message: 'Некорректный формат. Используйте ДД.ММ.ГГГГ.' };
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return { ok: false, message: 'Дата не существует. Проверьте значения.' };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return { ok: false, message: 'Прошедшая дата недоступна. Укажите будущую или сегодняшнюю.' };
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { ok: true, iso };
}

async function handleOrderCreate(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  if (userState.state !== 'authenticated') {
    await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
    return;
  }
  setUserState(userId, 'order_fulfillment', { user: userState.data.user, draft: { photos: [] } });
  await bot.sendMessage(chatId, 'Выберите тип получения:', getFulfillmentKeyboard());
}

async function handleOrderManage(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userState = getUserState(userId);
  if (userState.state !== 'authenticated') {
    await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
    return;
  }
  const rn = String((userState.data.user || {}).rights_name || '').toLowerCase();
  const isDev = rn === 'разработчик';
  const inline_keyboard = [
    [{ text: 'Белгород', callback_data: 'order_manage_addr_Белгород' }],
    [{ text: 'Строитель', callback_data: 'order_manage_addr_Строитель' }],
    [{ text: 'Северный', callback_data: 'order_manage_addr_Северный' }],
  ];
  if (isDev) {
    inline_keyboard.unshift([{ text: 'Тестовый магазин', callback_data: 'order_manage_addr_Тестовый магазин' }]);
  }
  inline_keyboard.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  await bot.sendMessage(chatId, 'Выберите адрес:', { reply_markup: { inline_keyboard } });
}

async function handleCallback(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  try {
    if (data === 'order_fulfillment_pickup') {
      const draft = st.data.draft || {};
      draft.fulfillment_type = 'pickup';
      setUserState(userId, 'order_store', { user: st.data.user, draft });
      await bot.sendMessage(chatId, 'Выберите адрес магазина:', getStoreKeyboard(st.data.user.rights_name));
    } else if (data === 'order_fulfillment_delivery') {
      const draft = st.data.draft || {};
      draft.fulfillment_type = 'delivery';
      setUserState(userId, 'order_store', { user: st.data.user, draft });
      await bot.sendMessage(chatId, 'Выберите адрес магазина:', getStoreKeyboard(st.data.user.rights_name));
    } else if (data.startsWith('order_store_')) {
      const storeName = data.replace('order_store_', '');
      const draft = st.data.draft || {};
      draft.store_name = storeName;
      if (st.state === 'order_edit_store') {
        await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, order_id: st.data.order_id });
      } else {
        setUserState(userId, 'order_creator_name', { user: st.data.user, draft });
        await bot.sendMessage(chatId, 'Укажите ваше Имя и Фамилию:');
      }
    } else if (data.startsWith('order_time_')) {
      const timeStr = data.replace('order_time_', '');
      const draft = st.data.draft || {};
      draft.execution_time = timeStr;
      if (st.state === 'order_edit_time') {
        await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, order_id: st.data.order_id });
      } else {
        setUserState(userId, 'order_type', { user: st.data.user, draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(st.data.user.rights_name));
      }
    } else if (data.startsWith('order_type_')) {
      const typeStr = data.replace('order_type_', '');
      const draft = st.data.draft || {};
      draft.order_type = typeStr;
      if (st.state === 'order_edit_order_type') {
        await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, order_id: st.data.order_id });
      } else {
        setUserState(userId, 'order_details', { user: st.data.user, draft, details: {} });
        if (typeStr === 'wedding') {
          setUserState(userId, 'order_wedding_composition', { user: st.data.user, draft, details: {}, photos: [] });
          await bot.sendMessage(chatId, 'Введите состав свадебного букета (текст):');
        } else if (typeStr === 'composition') {
          setUserState(userId, 'order_comp_kind', { user: st.data.user, draft, details: {} });
          await bot.sendMessage(chatId, 'Выберите: коробка или букет?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Коробка', callback_data: 'order_comp_box' }, { text: 'Букет', callback_data: 'order_comp_bouquet' }],
                [{ text: '⬅️ Назад', callback_data: 'order_back' }],
              ],
            },
          });
        } else if (typeStr === 'food') {
          setUserState(userId, 'order_food_positions', { user: st.data.user, draft, details: {} });
          await bot.sendMessage(chatId, 'Введите позиции еды (текст):');
        } else if (typeStr === 'flowers_food') {
          setUserState(userId, 'order_ff_food_positions', { user: st.data.user, draft, details: {}, photos: [] });
          await bot.sendMessage(chatId, 'Напишите позиции из меню, которые выбраны клиентом для заказа');
        } else {
          setUserState(userId, 'order_other_description', { user: st.data.user, draft, details: {}, photos: [] });
          await bot.sendMessage(chatId, 'Введите описание заказа (текст):');
        }
      }
    } else if (data === 'order_comp_box' || data === 'order_comp_bouquet') {
      const st2 = getUserState(userId);
      const det = st2.data.details || {};
      det.composition_kind = data === 'order_comp_box' ? 'box' : 'bouquet';
      if (st2.state === 'order_edit_comp_kind') {
        await showConfirm(bot, userId, chatId, { user: st2.data.user, draft: st2.data.draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, order_id: st2.data.order_id });
      } else {
        setUserState(userId, 'order_comp_photos', { user: st2.data.user, draft: st2.data.draft, details: det, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Отправьте до 3 фото композиции и открытки (при необходимости). Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      }
    } else if (data === 'order_next') {
      const st2 = getUserState(userId);
      const typeStr = (st2.data.draft || {}).order_type;
      if (st2.state === 'order_payment_status') {
        setUserState(userId, 'order_payment_status', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Выберите статус оплаты:', getPaymentStatusKeyboard());
        return;
      }
      if (st2.state === 'order_edit_photos_add_wait') {
        const kb = buildEditKeyboardFromState(st2.data);
        setUserState(userId, 'order_edit_select', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id, created_from_draft: st2.data.created_from_draft || false });
        await bot.sendMessage(chatId, 'Выберите деталь для изменения:', kb);
      } else if (st2.state === 'order_wedding_photos') {
        setUserState(userId, 'order_boutonniere', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Бутоньерка:', getYesNoKeyboard('order_boutonniere_yes', 'order_boutonniere_no'));
      } else if (st2.state === 'order_comp_photos') {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (st2.state === 'order_ff_photos') {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (st2.state === 'order_other_photos') {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (st2.state === 'order_comment') {
        setUserState(userId, 'order_payment_cost', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите стоимость заказа:');
      } else if (typeStr === 'flowers_food') {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (typeStr === 'food') {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      }
    } else if (data === 'payment_full' || data === 'payment_partial' || data === 'payment_none') {
      const st2 = getUserState(userId);
      const draft = st2.data.draft || {};
      let statusName = '';
      if (data === 'payment_full') statusName = 'Оплачен полностью';
      else if (data === 'payment_partial') statusName = 'Оплачен частично';
      else statusName = 'Не оплачен';
      const statusId = await orderService.findPaymentStatusIdByName(statusName);
      draft.payment_status_id = statusId;
      draft.payment_status_name = statusName;
      if (data === 'payment_full') {
        const tc = Number(draft.total_cost || 0);
        draft.paid_amount = tc;
        if ((draft.fulfillment_type || '') === 'delivery') {
          const det = st2.data.details || {};
          setUserState(userId, 'order_delivery_cost', { user: st2.data.user, draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
          await bot.sendMessage(chatId, 'Введите стоимость доставки:');
        } else {
          await showConfirm(bot, userId, chatId, { user: st2.data.user, draft, details: st2.data.details, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        }
      } else if (data === 'payment_none') {
        draft.paid_amount = 0;
        if ((draft.fulfillment_type || '') === 'delivery') {
          const det = st2.data.details || {};
          setUserState(userId, 'order_delivery_cost', { user: st2.data.user, draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
          await bot.sendMessage(chatId, 'Введите стоимость доставки:');
        } else {
          await showConfirm(bot, userId, chatId, { user: st2.data.user, draft, details: st2.data.details, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        }
      } else {
        setUserState(userId, 'order_payment_paid_amount', { user: st2.data.user, draft, details: st2.data.details, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите размер внесенной предоплаты:');
      }
    } else if (data === 'delivery_paid_yes' || data === 'delivery_paid_no') {
      const st2 = getUserState(userId);
      const det = st2.data.details || {};
      det.delivery_paid = data === 'delivery_paid_yes';
      const draft = st2.data.draft || {};
      if (typeof draft.total_cost === 'undefined') {
        setUserState(userId, 'order_payment_cost', { user: st2.data.user, draft, details: det, photos: st2.data.photos, contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите стоимость заказа:');
      } else {
        const isPartial = (draft.payment_status_name || '') === 'Оплачен частично';
        const hasPaidAmount = typeof draft.paid_amount !== 'undefined';
        if (isPartial && !hasPaidAmount) {
          setUserState(userId, 'order_payment_paid_amount', { user: st2.data.user, draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
          await bot.sendMessage(chatId, 'Введите размер внесенной предоплаты:');
        } else {
          await showConfirm(bot, userId, chatId, { user: st2.data.user, draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, card_photo: st2.data.card_photo || null, order_id: st2.data.order_id });
        }
      }
    } else if (data.startsWith('order_view_')) {
      const id = parseInt(data.replace('order_view_', ''), 10);
      const o = await orderService.getOrderWithDetails(id);
      if (!o) {
        await bot.sendMessage(chatId, 'Заказ не найден.');
        return;
      }
      const lines = [];
      lines.push(`Заказ №${o.id}`);
      lines.push(`Тип получения: ${o.fulfillment_type === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
      lines.push(`Магазин: ${o.address_name}`);
      lines.push(`Дата: ${formatDateRu(o.execution_date)}`);
      lines.push(`Время: ${formatTimeHM(o.execution_time)}`);
      lines.push(`Тип заказа: ${o.order_type_called || ''}`);
      if (o.creator_full_name) {
        lines.push(`Оформил: ${o.creator_full_name}`);
      }
      const detObj = (o.details && typeof o.details === 'object') ? o.details : {};
      if (detObj && detObj.composition_kind) {
        const ck = String(detObj.composition_kind || '');
        const ckRu = ck === 'box' ? 'коробка' : ck === 'bouquet' ? 'букет' : ck;
        lines.push(`Тип композиции: ${ckRu}`);
      }
      if (detObj && detObj.composition) {
        lines.push(`Состав: ${detObj.composition}`);
      }
      if (detObj && detObj.description) {
        lines.push(`Описание:\n${detObj.description}`);
      }
      if (o.card_photo) {
        lines.push('Открытка: фото добавлено');
      } else if (detObj.card_text) {
        lines.push(`Открытка: ${detObj.card_text}`);
      }
      if (detObj && detObj.comment) {
        lines.push(`Комментарий: ${detObj.comment}`);
      }
      if (typeof o.total_cost !== 'undefined') {
        const tc = Number(o.total_cost || 0);
        const pa = Number(o.paid_amount || 0);
        const rem = Math.max(tc - pa, 0);
        if ((o.fulfillment_type || '') === 'delivery') {
          const dc = (detObj && typeof detObj.delivery_cost !== 'undefined') ? Number(detObj.delivery_cost || 0) : undefined;
          if (typeof dc !== 'undefined') {
            lines.push(`Стоимость доставки: ${formatMoney(dc)} ₽`);
          }
          if (typeof detObj.delivery_paid !== 'undefined') {
            lines.push(`Оплата доставки: ${detObj.delivery_paid ? 'оплачено' : 'не оплачено'}`);
          }
        }
        lines.push(`Стоимость: ${formatMoney(tc)} ₽`);
        if (o.payment_status_name) lines.push(`Статус оплаты: ${o.payment_status_name}`);
        lines.push(`Оплачено: ${formatMoney(pa)} ₽`);
        lines.push(`Остаток: ${formatMoney(rem)} ₽`);
      }
      lines.push(`Контакты:`);
      lines.push(`Клиент: ${o.client_name}, ${o.client_phone}`);
      if (o.fulfillment_type !== 'pickup') {
        lines.push(`Получатель: ${o.recipient_name}, ${o.recipient_phone}${o.recipient_address ? ', ' + o.recipient_address : ''}`);
      }
      {
        const fidList = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
        const count = fidList.length + (o.card_photo ? 1 : 0);
        if (count > 0) lines.push(`Фото: ${count}`);
      }
      const buttons = [];
      if ((o.status || '') !== 'assembled') {
        buttons.push([{ text: '📦 Собран', callback_data: `order_assembled_${o.id}` }]);
      }
      buttons.push([{ text: '✅ Выполнено', callback_data: `order_complete_${o.id}` }]);
      buttons.push([{ text: '✏️ Редактировать', callback_data: `order_edit_${o.id}` }]);
      buttons.push([{ text: '⛔ Отменить заказ', callback_data: `order_cancel_${o.id}` }]);
      buttons.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
      const kb = { reply_markup: { inline_keyboard: buttons } };
      await bot.sendMessage(chatId, lines.join('\n'), kb);
      if (o.photos && o.photos.length) {
        try {
          const fidList = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
          if (fidList.length === 1) {
            await bot.sendPhoto(chatId, fidList[0]);
          } else if (fidList.length > 1) {
            if (bot.sendMediaGroup) {
              const chunkSize = 10;
              for (let i = 0; i < fidList.length; i += chunkSize) {
                const chunk = fidList.slice(i, i + chunkSize).map(fid => ({ type: 'photo', media: fid }));
                await bot.sendMediaGroup(chatId, chunk);
              }
            } else {
              for (const fid of fidList) {
                await bot.sendPhoto(chatId, fid);
              }
            }
          }
        } catch (e) {
          logger.error('Error sending order photos', e);
        }
      }
      if (o.card_photo) {
        try {
          await bot.sendPhoto(chatId, o.card_photo);
        } catch (e) {
          logger.error('Error sending card photo', e);
        }
      }
    } else if (data.startsWith('order_manage_addr_')) {
      const name = data.replace('order_manage_addr_', '');
      const rn = String(((st && st.data && st.data.user) || {}).rights_name || '').toLowerCase();
      const isDev = rn === 'разработчик';
      if (!isDev && String(name || '').toLowerCase() === 'тестовый магазин') {
        await bot.sendMessage(chatId, '❌ У вас нет доступа к этому адресу.');
        return;
      }
      const addrId = await orderService.findAddressIdByName(name);
      if (!addrId) {
        await bot.sendMessage(chatId, `Адрес "${name}" не найден.`);
        return;
      }
      const list = await orderService.listActiveOrdersByAddress(addrId, 10);
      if (!list.length) {
        await bot.sendMessage(chatId, `Активных заказов по адресу "${name}" нет.`);
        return;
      }
      const inline_keyboard = list.map(o => [
        { text: `${o.id} на ${formatDateRu(o.execution_date)}`, callback_data: `order_view_${o.id}` }
      ]);
      inline_keyboard.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
      await bot.sendMessage(chatId, `Активные заказы: ${name}`, { reply_markup: { inline_keyboard } });
    } else if (/^order_edit_\d+$/.test(data)) {
      const id = parseInt(data.replace('order_edit_', ''), 10);
      const o = await orderService.getOrderWithDetails(id);
      if (!o) {
        await bot.sendMessage(chatId, 'Заказ не найден.');
        return;
      }
      const draft = {
        fulfillment_type: o.fulfillment_type,
        store_name: o.address_name,
        execution_date: o.execution_date,
        execution_time: o.execution_time,
        order_type: o.order_type_name,
        creator_name: o.creator_full_name || '',
      };
      const details = o.details || {};
      const photos = Array.isArray(o.photos) ? o.photos : [];
      const contacts = {
        client_name: o.client_name || '',
        client_phone: o.client_phone || '',
        recipient_name: o.recipient_name || '',
        recipient_phone: o.recipient_phone || '',
        recipient_address: o.recipient_address || '',
      };
      await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details, photos, contacts, order_id: id });
    } else if (data.startsWith('order_complete_')) {
      const id = parseInt(data.replace('order_complete_', ''), 10);
      await orderService.completeOrder(id);
      await bot.sendMessage(chatId, `Заказ №${id} отмечен как выполненный.`);
    } else if (data.startsWith('order_assembled_')) {
      const id = parseInt(data.replace('order_assembled_', ''), 10);
      const current = await orderService.getOrderWithDetails(id);
      if (!current) {
        await bot.sendMessage(chatId, 'Заказ не найден.');
        return;
      }
      if ((current.status || '') === 'assembled') {
        await bot.sendMessage(chatId, `Заказ №${id} уже в статусе "Собран".`);
        return;
      }
      await orderService.assembleOrder(id);
      const o = await orderService.getOrderWithDetails(id);
      if (o) {
        const detObj = (o.details && typeof o.details === 'object') ? o.details : {};
        const lines2 = [];
        lines2.push(`Заказ №${id} собран!`);
        lines2.push(`Тип получения: ${o.fulfillment_type === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
        lines2.push(`Магазин: ${o.address_name}`);
        lines2.push(`Дата: ${formatDateRu(o.execution_date)}`);
        lines2.push(`Время: ${formatTimeHM(o.execution_time)}`);
        lines2.push(`Тип заказа: ${o.order_type_called || ''}`);
        if (o.creator_full_name) {
          lines2.push(`Оформил: ${o.creator_full_name}`);
        }
        if (o.card_photo) {
          lines2.push('Открытка: фото добавлено');
        } else if (detObj.card_text) {
          lines2.push(`Открытка: ${detObj.card_text}`);
        }
        if (typeof o.total_cost !== 'undefined') {
          const tc = Number(o.total_cost || 0);
          const pa = Number(o.paid_amount || 0);
          const rem = Math.max(tc - pa, 0);
          if ((o.fulfillment_type || '') === 'delivery') {
            const dc = (typeof detObj.delivery_cost !== 'undefined') ? Number(detObj.delivery_cost || 0) : undefined;
            if (typeof dc !== 'undefined') {
              lines2.push(`Стоимость доставки: ${formatMoney(dc)} ₽`);
            }
            if (typeof detObj.delivery_paid !== 'undefined') {
              lines2.push(`Оплата доставки: ${detObj.delivery_paid ? 'оплачено' : 'не оплачено'}`);
            }
          }
          lines2.push(`Стоимость: ${formatMoney(tc)} ₽`);
          if (o.payment_status_name) lines2.push(`Статус оплаты: ${o.payment_status_name}`);
          lines2.push(`Оплачено: ${formatMoney(pa)} ₽`);
          lines2.push(`Остаток: ${formatMoney(rem)} ₽`);
        }
        lines2.push(`Контакты:`);
        lines2.push(`Клиент: ${o.client_name}, ${o.client_phone}`);
        if (o.fulfillment_type !== 'pickup') {
          lines2.push(`Получатель: ${o.recipient_name}, ${o.recipient_phone}${o.recipient_address ? ', ' + o.recipient_address : ''}`);
        }
        {
          const fidList = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
          const count = fidList.length + (o.card_photo ? 1 : 0);
          if (count > 0) lines2.push(`Фото: ${count}`);
        }
        const msgText2 = lines2.join('\n');
        try {
          const addrName2 = String(o.address_name || '');
          const direct2 = resolveChannelForStore(addrName2);
          const fallback2 = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
          const addrChannel2 = direct2 || fallback2 || '';
          if (addrChannel2 && isValidChannelId(addrChannel2)) {
            await sendToChannel(addrChannel2, msgText2);
            const fidList2 = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
            if (fidList2.length === 1) {
              await sendPhotoToChannel(addrChannel2, fidList2[0]);
            } else if (fidList2.length > 1) {
              await sendMediaGroupToChannel(addrChannel2, fidList2);
            }
            if (o.card_photo) {
              await sendPhotoToChannel(addrChannel2, o.card_photo);
            }
          } else {
            logger.error(`Order ${id}: address channel not configured for "${addrName2}"`);
          }
        } catch (sendErrA) {
          logger.error('Order assembled send to address channel error', sendErrA);
        }
        try {
          const isTestStoreAssembled = String(o.address_name || '').toLowerCase() === 'тестовый магазин';
          if (!isTestStoreAssembled && ADMIN_CHANNEL_ID && isValidChannelId(ADMIN_CHANNEL_ID)) {
            await sendToChannel(ADMIN_CHANNEL_ID, msgText2);
            const fidList3 = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
            if (fidList3.length === 1) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, fidList3[0]);
            } else if (fidList3.length > 1) {
              await sendMediaGroupToChannel(ADMIN_CHANNEL_ID, fidList3);
            }
            if (o.card_photo) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, o.card_photo);
            }
          } else if (!isTestStoreAssembled) {
            logger.error(`Order ${id}: admin channel not configured`);
          }
        } catch (sendErrB) {
          logger.error('Order assembled send to admin channel error', sendErrB);
        }
      }
      await bot.sendMessage(chatId, `Заказ №${id} отмечен как собран.`);
    } else if (data.startsWith('order_cancel_')) {
      const id = parseInt(data.replace('order_cancel_', ''), 10);
      await orderService.cancelOrder(id);
      await bot.sendMessage(chatId, `Заказ №${id} отменен. Напоминания по нему отключены.`);
    } else if (data === 'order_boutonniere_yes' || data === 'order_boutonniere_no') {
      const st2 = getUserState(userId);
      const det = st2.data.details || {};
      det.has_boutonniere = data === 'order_boutonniere_yes';
      if (st2.state === 'order_edit_boutonniere') {
        await showConfirm(bot, userId, chatId, { user: st2.data.user, draft: st2.data.draft, details: det, photos: st2.data.photos || [], contacts: st2.data.contacts, order_id: st2.data.order_id });
      } else {
        setUserState(userId, 'order_contacts_client_name', { user: st2.data.user, draft: st2.data.draft, details: det, photos: st2.data.photos || [] });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      }
    } else if (data === 'order_back') {
      const s = st.state;
      const sd = st.data;
      if (s === 'order_store') {
        setUserState(userId, 'order_fulfillment', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип получения:', getFulfillmentKeyboard());
      } else if (s === 'order_date_text') {
        setUserState(userId, 'order_creator_name', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Укажите ваше Имя и Фамилию:');
      } else if (s === 'order_time') {
        setUserState(userId, 'order_date_text', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Введите дату выполнения в формате ДД.ММ.ГГГГ (прошедшие даты недоступны):');
      } else if (s === 'order_type') {
        setUserState(userId, 'order_time', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(
          chatId,
          'Выберите время выполнения:',
          ((sd.draft || {}).execution_date ? getTimeKeyboardForDate((sd.draft || {}).execution_date) : getTimeKeyboard())
        );
      } else if (s === 'order_wedding_composition') {
        setUserState(userId, 'order_type', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.user.rights_name));
      } else if (s === 'order_wedding_color') {
        setUserState(userId, 'order_wedding_composition', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Введите состав свадебного букета (текст):');
      } else if (s === 'order_wedding_photos') {
        setUserState(userId, 'order_wedding_composition', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Введите состав свадебного букета (текст):');
      } else if (s === 'order_boutonniere') {
        setUserState(userId, 'order_wedding_photos', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Отправьте до 3 фото букета. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      } else if (s === 'order_comp_kind') {
        setUserState(userId, 'order_type', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.user.rights_name));
      } else if (s === 'order_comp_photos') {
        setUserState(userId, 'order_comp_kind', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Выберите: коробка или букет?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Коробка', callback_data: 'order_comp_box' }, { text: 'Букет', callback_data: 'order_comp_bouquet' }],
              [{ text: '⬅️ Назад', callback_data: 'order_back' }],
            ],
          },
        });
      } else if (s === 'order_card_text') {
        setUserState(userId, 'order_contacts_client_name', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [], card_photo: sd.card_photo || null });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (s === 'order_delivery_cost') {
        setUserState(userId, 'order_comment', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [], contacts: sd.contacts, card_photo: sd.card_photo || null, order_id: sd.order_id });
        await bot.sendMessage(chatId, 'Введите комментарий по заказу при наличии', getNextKeyboard());
      } else if (s === 'order_delivery_paid') {
        setUserState(userId, 'order_delivery_cost', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [], contacts: sd.contacts, card_photo: sd.card_photo || null, order_id: sd.order_id });
        await bot.sendMessage(chatId, 'Введите стоимость доставки:');
      } else if (s === 'order_ff_photos') {
        setUserState(userId, 'order_ff_food_positions', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Напишите позиции из меню, которые выбраны клиентом для заказа');
      } else if (s === 'order_ff_food_positions') {
        setUserState(userId, 'order_type', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.user.rights_name));
      } else if (s === 'order_food_positions') {
        setUserState(userId, 'order_type', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.user.rights_name));
      } else if (s === 'order_other_description') {
        setUserState(userId, 'order_type', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.user.rights_name));
      } else if (s === 'order_other_photos') {
        setUserState(userId, 'order_other_description', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
        await bot.sendMessage(chatId, 'Введите описание заказа (текст):');
      } else if (s === 'order_contacts_client_name') {
        const typeStr = (sd.draft || {}).order_type;
        if (typeStr === 'composition') {
          setUserState(userId, 'order_comp_photos', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
          await bot.sendMessage(chatId, 'Отправьте до 3 фото композиции и открытки (при необходимости). Когда будете готовы — нажмите "Далее".', getNextKeyboard());
        } else if (typeStr === 'flowers_food') {
          setUserState(userId, 'order_ff_photos', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
          await bot.sendMessage(chatId, 'Отправьте до 3 фото цветов. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
        } else if (typeStr === 'food') {
          setUserState(userId, 'order_food_positions', { user: sd.user, draft: sd.draft, details: sd.details });
          await bot.sendMessage(chatId, 'Введите позиции еды (текст):');
        } else {
          setUserState(userId, 'order_other_photos', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos || [] });
          await bot.sendMessage(chatId, 'Отправьте до 3 фото. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
        }
      } else if (s === 'order_contacts_client_phone') {
        setUserState(userId, 'order_contacts_client_name', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts });
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (s === 'order_contacts_recipient_name') {
        setUserState(userId, 'order_contacts_client_phone', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts });
        await bot.sendMessage(chatId, 'Введите телефон клиента:');
      } else if (s === 'order_contacts_recipient_phone') {
        setUserState(userId, 'order_contacts_recipient_name', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts });
        await bot.sendMessage(chatId, 'Введите имя получателя:');
      } else if (s === 'order_contacts_address') {
        setUserState(userId, 'order_contacts_recipient_phone', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts });
        await bot.sendMessage(chatId, 'Введите телефон получателя:');
      } else if (s === 'order_creator_name') {
        setUserState(userId, 'order_store', { user: sd.user, draft: sd.draft });
        await bot.sendMessage(chatId, 'Выберите адрес магазина:', getStoreKeyboard(sd.user.rights_name));
      } else if (s === 'order_comment') {
        setUserState(userId, 'order_creator_name', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts });
        await bot.sendMessage(chatId, 'Укажите ваше Имя и Фамилию:');
      } else if (s === 'order_payment_status') {
        setUserState(userId, 'order_payment_cost', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts, card_photo: sd.card_photo || null, order_id: sd.order_id });
        await bot.sendMessage(chatId, 'Введите стоимость заказа:');
      } else if (s === 'order_payment_paid_amount') {
        setUserState(userId, 'order_payment_status', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts, card_photo: sd.card_photo || null, order_id: sd.order_id });
        await bot.sendMessage(chatId, 'Выберите статус оплаты:', getPaymentStatusKeyboard());
      } else if (s === 'order_edit_select') {
        await showConfirm(bot, userId, chatId, sd);
      } else if (s === 'order_edit_date' || s === 'order_edit_time' || s === 'order_edit_store' || s === 'order_edit_order_type' || s === 'order_edit_comp_kind' || s === 'order_edit_boutonniere' || s === 'order_edit_text') {
        const kb = buildEditKeyboardFromState(sd);
        setUserState(userId, 'order_edit_select', { user: sd.user, draft: sd.draft, details: sd.details, photos: sd.photos, contacts: sd.contacts, order_id: sd.order_id, created_from_draft: sd.created_from_draft || false });
        await bot.sendMessage(chatId, 'Выберите деталь для изменения:', kb);
      } else if (s === 'order_confirm') {
        await showConfirm(bot, userId, chatId, sd);
      } else {
        const rightsName = sd.user.rights_name;
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
      }
    } else if (data === 'cancel') {
      const st2 = getUserState(userId);
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user: st2.data.user || st.data.user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
      await bot.sendMessage(chatId, '❌ Действие отменено.');
    } else if (data === 'noop') {
      // ignore
    } else if (data === 'back_menu') {
      const st2 = getUserState(userId);
      const rightsName = st2.data.user.rights_name;
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
    } else if (data === 'order_edit_back') {
      const st2 = getUserState(userId);
      await showConfirm(bot, userId, chatId, { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id, created_from_draft: st2.data.created_from_draft || false });
    } else if (data.startsWith('order_edit_key_')) {
      const key = data.replace('order_edit_key_', '');
      const st2 = getUserState(userId);
      if (key === 'execution_date') {
        setUserState(userId, 'order_edit_date', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите дату выполнения в формате ДД.ММ.ГГГГ:');
      } else if (key === 'execution_time') {
        setUserState(userId, 'order_edit_time', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(
          chatId,
          'Выберите время выполнения:',
          ((st2.data.draft || {}).execution_date ? getTimeKeyboardForDate((st2.data.draft || {}).execution_date) : getTimeKeyboard())
        );
      } else if (key === 'store_name') {
        setUserState(userId, 'order_edit_store', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Выберите адрес магазина:', getStoreKeyboard(st2.data.user.rights_name));
      } else if (key === 'order_type') {
        setUserState(userId, 'order_edit_order_type', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(st2.data.user.rights_name));
      } else if (key === 'total_cost') {
        setUserState(userId, 'order_edit_total_cost', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите стоимость заказа:');
      } else if (key === 'payment_status') {
        setUserState(userId, 'order_edit_payment_status', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Выберите статус оплаты:', getPaymentStatusKeyboard());
      } else if (key === 'paid_amount') {
        setUserState(userId, 'order_edit_paid_amount', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Введите размер внесенной предоплаты:');
      } else if (key === 'composition_kind') {
        setUserState(userId, 'order_edit_comp_kind', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Выберите: коробка или букет?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Коробка', callback_data: 'order_comp_box' }, { text: 'Букет', callback_data: 'order_comp_bouquet' }],
              [{ text: '⬅️ Назад', callback_data: 'order_back' }],
            ],
          },
        });
      } else if (key === 'has_boutonniere') {
        setUserState(userId, 'order_edit_boutonniere', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
        await bot.sendMessage(chatId, 'Бутоньерка:', getYesNoKeyboard('order_boutonniere_yes', 'order_boutonniere_no'));
      } else {
        setUserState(userId, 'order_edit_text', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id, current_edit_key: key });
        await bot.sendMessage(chatId, `Введите значение для: ${detailKeyToRu(key)}:`);
      }
    } else if (data === 'order_edit_photos') {
      const st2 = getUserState(userId);
      setUserState(userId, 'order_edit_photos_menu', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id });
      const kb = { reply_markup: { inline_keyboard: [
        [{ text: '🗑️ Удалить фотографии по заказу', callback_data: 'order_edit_photos_delete' }],
        [{ text: '➕ Добавить фото дополнительно', callback_data: 'order_edit_photos_add' }],
        [{ text: '⬅️ Назад', callback_data: 'order_edit_back' }],
        [{ text: '❌ Отмена', callback_data: 'cancel' }],
      ] } };
      await bot.sendMessage(chatId, 'Выберите необходиоме действие', kb);
    } else if (data === 'order_edit_photos_delete') {
      const st2 = getUserState(userId);
      const oid = st2.data.order_id;
      await orderService.deleteOrderPhotos(oid);
      setUserState(userId, 'order_edit_photos_add_wait', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: [], contacts: st2.data.contacts, order_id: oid });
      await bot.sendMessage(chatId, 'Отправьте новые фотографии до 3 штук. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (data === 'order_edit_photos_add') {
      const st2 = getUserState(userId);
      setUserState(userId, 'order_edit_photos_add_wait', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos || [], contacts: st2.data.contacts, order_id: st2.data.order_id });
      await bot.sendMessage(chatId, 'Отправьте новое фото. Лимит — до 3 фото по заказу. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (data === 'order_edit') {
      const kb = buildEditKeyboardFromState(st.data);
      setUserState(userId, 'order_edit_select', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, order_id: st.data.order_id });
      await bot.sendMessage(chatId, 'Выберите деталь для изменения:', kb);
    } else if (data.startsWith('order_delete_')) {
      const id = parseInt(data.replace('order_delete_', ''), 10);
      if (Number.isFinite(id)) {
        try {
          await orderService.deleteOrder(id);
          clearUserState(userId);
          setUserState(userId, 'authenticated', { user: st.data.user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
          await bot.sendMessage(chatId, `🗑️ Заказ №${id} удален.`);
          const rightsName = st.data.user.rights_name;
          await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
        } catch (e) {
          logger.error('Delete order error', e);
          await bot.sendMessage(chatId, '❌ Не удалось удалить заказ. Попробуйте позже.');
        }
      } else {
        await bot.sendMessage(chatId, '❌ Некорректный ID заказа для удаления.');
      }
    } else if (data === 'interrupt_order_delete') {
      const st2 = getUserState(userId);
      const orderId = st2.data.order_id;
      try {
        if (orderId) {
          await orderService.deleteOrder(orderId);
        }
      } catch (_) {}
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user: st2.data.user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
      await bot.sendMessage(chatId, 'Заказ был удален.');
      const rightsName = st2.data.user.rights_name;
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
    } else if (data === 'interrupt_order_continue') {
      const st2 = getUserState(userId);
      const s = st2.state;
      const sd = st2.data;
      if (s === 'order_store') {
        await bot.sendMessage(chatId, 'Выберите адрес магазина:', getStoreKeyboard(sd.data.user.rights_name));
      } else if (s === 'order_creator_name') {
        await bot.sendMessage(chatId, 'Укажите ваше Имя и Фамилию:');
      } else if (s === 'order_date_text') {
        await bot.sendMessage(chatId, 'Введите дату выполнения в формате ДД.ММ.ГГГГ (прошедшие даты недоступны):');
      } else if (s === 'order_time') {
        await bot.sendMessage(chatId, 'Выберите время выполнения:', ((sd.draft || {}).execution_date ? getTimeKeyboardForDate((sd.draft || {}).execution_date) : getTimeKeyboard()));
      } else if (s === 'order_type') {
        await bot.sendMessage(chatId, 'Выберите тип заказа:', await getOrderTypeKeyboard(sd.data.user.rights_name));
      } else if (s === 'order_wedding_composition') {
        await bot.sendMessage(chatId, 'Введите состав свадебного букета (текст):');
      } else if (s === 'order_wedding_photos') {
        await bot.sendMessage(chatId, 'Отправьте до 3 фото букета. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      } else if (s === 'order_boutonniere') {
        await bot.sendMessage(chatId, 'Бутоньерка:', getYesNoKeyboard('order_boutonniere_yes', 'order_boutonniere_no'));
      } else if (s === 'order_comp_kind') {
        await bot.sendMessage(chatId, 'Выберите: коробка или букет?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Коробка', callback_data: 'order_comp_box' }, { text: 'Букет', callback_data: 'order_comp_bouquet' }],
              [{ text: '⬅️ Назад', callback_data: 'order_back' }],
            ],
          },
        });
      } else if (s === 'order_comp_photos') {
        await bot.sendMessage(chatId, 'Отправьте до 3 фото композиции и открытки (при необходимости). Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      } else if (s === 'order_ff_photos') {
        await bot.sendMessage(chatId, 'Отправьте до 3 фото цветов. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      } else if (s === 'order_ff_food_positions') {
        await bot.sendMessage(chatId, 'Напишите позиции из меню, которые выбраны клиентом для заказа');
      } else if (s === 'order_food_positions') {
        await bot.sendMessage(chatId, 'Введите позиции еды (текст):');
      } else if (s === 'order_other_description') {
        await bot.sendMessage(chatId, 'Введите описание заказа (текст):');
      } else if (s === 'order_other_photos') {
        await bot.sendMessage(chatId, 'Отправьте до 3 фото. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
      } else if (s === 'order_contacts_client_name') {
        await bot.sendMessage(chatId, 'Введите имя клиента:');
      } else if (s === 'order_contacts_client_phone') {
        await bot.sendMessage(chatId, 'Введите телефон клиента:');
      } else if (s === 'order_contacts_recipient_name') {
        await bot.sendMessage(chatId, 'Введите имя получателя:');
      } else if (s === 'order_contacts_recipient_phone') {
        await bot.sendMessage(chatId, 'Введите телефон получателя:');
      } else if (s === 'order_contacts_address') {
        await bot.sendMessage(chatId, 'Введите адрес получателя:');
      } else if (s === 'order_comment') {
        await bot.sendMessage(chatId, 'Введите комментарий по заказу при наличии', getNextKeyboard());
      } else if (s === 'order_payment_cost') {
        await bot.sendMessage(chatId, 'Введите стоимость заказа:');
      } else if (s === 'order_payment_status') {
        await bot.sendMessage(chatId, 'Выберите статус оплаты:', getPaymentStatusKeyboard());
      } else if (s === 'order_payment_paid_amount') {
        await bot.sendMessage(chatId, 'Введите размер внесенной предоплаты:');
      } else if (s === 'order_confirm') {
        await showConfirm(bot, userId, chatId, sd);
      } else {
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(sd.user.rights_name));
      }
    }
  } catch (e) {
    logger.error('Order callback error', e);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleOrderMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const st = getUserState(userId);
  try {
    if (st.state === 'order_details') {
      const text = msg.text;
      const photos = msg.photo;
      const det = st.data.details || {};
      if (text) {
        det.description = det.description ? det.description + '\n' + text : text;
      }
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const ph = st.data.photos || [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_details', { user: st.data.user, draft: st.data.draft, details: det, photos: ph });
        await bot.sendMessage(chatId, `Фото добавлено (${(ph.length)}/3).`);
        return;
      }
      setUserState(userId, 'order_details', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
    } else if (st.state === 'order_comp_photos') {
      const photos = msg.photo;
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const ph = st.data.photos || [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_comp_photos', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: ph });
        await bot.sendMessage(chatId, `Фото добавлено (${(ph.length)}/3). Можете отправить еще или нажмите "Далее".`);
        return;
      } else {
        await bot.sendMessage(chatId, 'Отправьте фото или нажмите "Далее" для перехода к контактам.');
      }
    } else if (st.state === 'order_wedding_composition') {
      const composition = msg.text;
      const det = st.data.details || {};
      det.composition = composition;
      setUserState(userId, 'order_wedding_photos', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Отправьте до 3 фото букета. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (st.state === 'order_wedding_photos') {
      const photos = msg.photo;
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const ph = st.data.photos || [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_wedding_photos', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: ph });
        await bot.sendMessage(chatId, `Фото добавлено (${(ph.length)}/3). Можете отправить еще или нажмите "Далее".`);
        return;
      } else {
        await bot.sendMessage(chatId, 'Отправьте фото или нажмите "Далее" для перехода к бутоньерке.');
      }
    } else if (st.state === 'order_ff_food_positions') {
      const positions = msg.text;
      const det = st.data.details || {};
      det.composition = positions;
      setUserState(userId, 'order_ff_photos', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Отправьте до 3 фото цветов. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (st.state === 'order_ff_photos') {
      const photos = msg.photo;
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const ph = st.data.photos || [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_ff_photos', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: ph });
        await bot.sendMessage(chatId, `Фото добавлено (${(ph.length)}/3). Можете отправить еще или нажмите "Далее".`);
        return;
      } else {
        await bot.sendMessage(chatId, 'Отправьте фото или нажмите "Далее" для перехода к контактам.');
      }
    } else if (st.state === 'order_food_positions') {
      const positions = msg.text;
      const det = st.data.details || {};
      det.composition = positions;
      setUserState(userId, 'order_contacts_client_name', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Введите имя клиента:');
    } else if (st.state === 'order_other_description') {
      const description = msg.text;
      const det = st.data.details || {};
      det.description = description;
      setUserState(userId, 'order_other_photos', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Отправьте до 3 фото. Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (st.state === 'order_other_photos') {
      const photos = msg.photo;
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const ph = st.data.photos || [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_other_photos', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: ph });
        await bot.sendMessage(chatId, `Фото добавлено (${(ph.length)}/3). Можете отправить еще или нажмите "Далее".`);
        return;
      } else {
        await bot.sendMessage(chatId, 'Отправьте фото или нажмите "Далее" для перехода к контактам.');
      }
    } else if (st.state === 'order_edit_photos_add_wait') {
      const photos = msg.photo;
      if (photos && photos.length) {
        const biggest = photos[photos.length - 1];
        const fileId = biggest.file_id;
        const oid = st.data.order_id;
        const cnt = await orderService.getOrderPhotosCount(oid);
        if (cnt >= 3) {
          const kb = { reply_markup: { inline_keyboard: [
            [{ text: '🗑️ Удалить фотографии по заказу', callback_data: 'order_edit_photos_delete' }],
            [{ text: '⬅️ Назад', callback_data: 'order_edit_back' }],
            [{ text: '❌ Отмена', callback_data: 'cancel' }],
          ] } };
          await bot.sendMessage(chatId, 'Лимит 3 фото по заказу. Удалите фото и добавьте заново.', kb);
          setUserState(userId, 'order_edit_photos_menu', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos || [], contacts: st.data.contacts, order_id: oid });
          return;
        }
        await orderService.addOrderPhoto(oid, fileId);
        const newCnt = cnt + 1;
        const ph = Array.isArray(st.data.photos) ? st.data.photos.slice() : [];
        if (ph.length < 3) ph.push(fileId);
        setUserState(userId, 'order_edit_photos_add_wait', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: ph, contacts: st.data.contacts, order_id: oid });
        await bot.sendMessage(chatId, `Фото добавлено (${newCnt}/3). Можете отправить еще или нажмите "Далее".`);
        return;
      } else {
        await bot.sendMessage(chatId, 'Отправьте фото или нажмите "Далее".');
      }
    } else if (st.state === 'order_date_text') {
      const input = msg.text;
      const result = parseDateDDMMYYYY(input);
      if (!result.ok) {
        await bot.sendMessage(chatId, `❌ ${result.message}\nВведите дату в формате ДД.ММ.ГГГГ:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.execution_date = result.iso;
      setUserState(userId, 'order_time', { user: st.data.user, draft });
      await bot.sendMessage(chatId, 'Выберите время выполнения:', getTimeKeyboardForDate(result.iso));
    } else if (st.state === 'order_color') {
      // legacy path: переадресуем сразу на фото композиции
      setUserState(userId, 'order_comp_photos', { user: st.data.user, draft: st.data.draft, details: st.data.details || {}, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Отправьте до 3 фото композиции и открытки (при необходимости). Когда будете готовы — нажмите "Далее".', getNextKeyboard());
    } else if (st.state === 'order_card_text') {
      const text = msg.text;
      const det = st.data.details || {};
      det.card_text = text;
      setUserState(userId, 'order_contacts_client_name', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos || [] });
      await bot.sendMessage(chatId, 'Введите имя клиента:');
    } else if (st.state === 'order_contacts_client_name') {
      const name = msg.text;
      setUserState(userId, 'order_contacts_client_phone', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts: { client_name: name } });
      await bot.sendMessage(chatId, 'Введите телефон клиента:');
    } else if (st.state === 'order_contacts_client_phone') {
      const phone = msg.text;
      const contacts = st.data.contacts || {};
      contacts.client_phone = phone;
      if ((st.data.draft.fulfillment_type || '') === 'pickup') {
        setUserState(userId, 'order_comment', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
        await bot.sendMessage(chatId, 'Введите комментарий по заказу при наличии', getNextKeyboard());
      } else {
        setUserState(userId, 'order_contacts_recipient_name', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
        await bot.sendMessage(chatId, 'Введите имя получателя:');
      }
    } else if (st.state === 'order_contacts_recipient_name') {
      const name = msg.text;
      const contacts = st.data.contacts || {};
      contacts.recipient_name = name;
      setUserState(userId, 'order_contacts_recipient_phone', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
      await bot.sendMessage(chatId, 'Введите телефон получателя:');
    } else if (st.state === 'order_contacts_recipient_phone') {
      const phone = msg.text;
      const contacts = st.data.contacts || {};
      contacts.recipient_phone = phone;
      if ((st.data.draft.fulfillment_type || '') === 'delivery') {
        setUserState(userId, 'order_contacts_address', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
        await bot.sendMessage(chatId, 'Введите адрес получателя:');
      } else {
        setUserState(userId, 'order_comment', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
        await bot.sendMessage(chatId, 'Введите комментарий по заказу при наличии', getNextKeyboard());
      }
    } else if (st.state === 'order_contacts_address') {
      const addr = msg.text;
      const contacts = st.data.contacts || {};
      contacts.recipient_address = addr;
      setUserState(userId, 'order_comment', { user: st.data.user, draft: st.data.draft, details: st.data.details, photos: st.data.photos, contacts });
      await bot.sendMessage(chatId, 'Введите комментарий по заказу при наличии', getNextKeyboard());
    } else if (st.state === 'order_creator_name') {
      const name = msg.text;
      const draft = st.data.draft || {};
      draft.creator_name = name;
      setUserState(userId, 'order_date_text', { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts });
      await bot.sendMessage(chatId, 'Введите дату выполнения в формате ДД.ММ.ГГГГ (прошедшие даты недоступны):');
    } else if (st.state === 'order_comment') {
      const text = msg.text;
      const det = st.data.details || {};
      det.comment = text;
      const draft = st.data.draft || {};
      setUserState(userId, 'order_payment_cost', { user: st.data.user, draft, details: det, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
      await bot.sendMessage(chatId, 'Введите стоимость заказа:');
    } else if (st.state === 'order_delivery_cost') {
      const res = parseMoney(msg.text);
      if (!res.ok) {
        await bot.sendMessage(chatId, `❌ ${res.message}\nВведите стоимость доставки:`);
        return;
      }
      const det = st.data.details || {};
      det.delivery_cost = res.value;
      setUserState(userId, 'order_delivery_paid', { user: st.data.user, draft: st.data.draft, details: det, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
      await bot.sendMessage(chatId, 'Стоимость доставки оплачена?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Оплачена полностью', callback_data: 'delivery_paid_yes' }, { text: 'Не оплачена', callback_data: 'delivery_paid_no' }],
            [{ text: '⬅️ Назад', callback_data: 'order_back' }],
          ],
        },
      });
    } else if (st.state === 'order_payment_cost') {
      const res = parseMoney(msg.text);
      if (!res.ok) {
        await bot.sendMessage(chatId, `❌ ${res.message}\nВведите стоимость заказа:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.total_cost = res.value;
      setUserState(userId, 'order_payment_status', { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
      await bot.sendMessage(chatId, 'Выберите статус оплаты:', getPaymentStatusKeyboard());
    } else if (st.state === 'order_payment_paid_amount') {
      const res = parseMoney(msg.text);
      if (!res.ok) {
        await bot.sendMessage(chatId, `❌ ${res.message}\nВведите размер внесенной предоплаты:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.paid_amount = res.value;
      if ((draft.fulfillment_type || '') === 'delivery') {
        const det = st.data.details || {};
        if (typeof det.delivery_cost === 'undefined') {
          setUserState(userId, 'order_delivery_cost', { user: st.data.user, draft, details: det, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
          await bot.sendMessage(chatId, 'Введите стоимость доставки:');
        } else {
          setUserState(userId, 'order_delivery_paid', { user: st.data.user, draft, details: det, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
          await bot.sendMessage(chatId, 'Стоимость доставки оплачена?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Оплачена полностью', callback_data: 'delivery_paid_yes' }, { text: 'Не оплачена', callback_data: 'delivery_paid_no' }],
                [{ text: '⬅️ Назад', callback_data: 'order_back' }],
              ],
            },
          });
        }
      } else {
        await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
      }
    } else if (st.state === 'order_edit_total_cost') {
      const res = parseMoney(msg.text);
      if (!res.ok) {
        await bot.sendMessage(chatId, `❌ ${res.message}\nВведите стоимость заказа:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.total_cost = res.value;
      if ((draft.payment_status_name || '').toLowerCase() === 'оплачен полностью') {
        draft.paid_amount = res.value;
      }
      await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
    } else if (st.state === 'order_edit_paid_amount') {
      const res = parseMoney(msg.text);
      if (!res.ok) {
        await bot.sendMessage(chatId, `❌ ${res.message}\nВведите размер внесенной предоплаты:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.paid_amount = res.value;
      await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, card_photo: st.data.card_photo || null, order_id: st.data.order_id });
    } else if (st.state === 'order_edit_date') {
      const input = msg.text;
      const result = parseDateDDMMYYYY(input);
      if (!result.ok) {
        await bot.sendMessage(chatId, `❌ ${result.message}\nВведите дату в формате ДД.ММ.ГГГГ:`);
        return;
      }
      const draft = st.data.draft || {};
      draft.execution_date = result.iso;
      await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: st.data.details, photos: st.data.photos, contacts: st.data.contacts, order_id: st.data.order_id });
    } else if (st.state === 'order_edit_text') {
      const val = msg.text;
      const key = st.data.current_edit_key;
      const draft = st.data.draft || {};
      const det = st.data.details || {};
      const contacts = st.data.contacts || {};
      if (key === 'composition' || key === 'color' || key === 'card_text' || key === 'description' || key === 'comment') {
        det[key] = val;
      } else if (key === 'client_name' || key === 'client_phone' || key === 'recipient_name' || key === 'recipient_phone' || key === 'recipient_address') {
        contacts[key] = val;
      } else if (key === 'store_name' || key === 'order_type' || key === 'creator_name') {
        draft[key] = val;
      }
      await showConfirm(bot, userId, chatId, { user: st.data.user, draft, details: det, photos: st.data.photos, contacts, order_id: st.data.order_id });
    } else if (st.state === 'order_confirm') {
      return;
    }
  } catch (e) {
    logger.error('Order message error', e);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

function buildSummary(draft, details, photos, contacts, cardPhoto, orderId, typeCalled) {
  const lines = [];
  if (orderId) {
    lines.push(`Итоговый заказ №${orderId}:`);
  } else {
    lines.push('Итоговый заказ:');
  }
  lines.push(`Тип получения: ${draft.fulfillment_type === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
  lines.push(`Точка: ${draft.store_name}`);
  lines.push(`Дата: ${formatDateRu(draft.execution_date)}`);
  lines.push(`Время: ${formatTimeHM(draft.execution_time)}`);
  lines.push(`Тип заказа: ${typeCalled || orderTypeRu(draft.order_type)}`);
  if (draft.creator_name) {
    lines.push(`Оформил: ${draft.creator_name}`);
  }
  if (details && details.composition_kind) {
    lines.push(`Тип композиции: ${details.composition_kind === 'box' ? 'коробка' : 'букет'}`);
  }
  if (details && details.composition) {
    lines.push(`Состав: ${details.composition}`);
  }
  if (details && details.description) {
    lines.push(`Описание:\n${details.description}`);
  }
  if (cardPhoto) {
    lines.push('Открытка: фото добавлено');
  } else if (details && details.card_text) {
    lines.push(`Открытка: ${details.card_text}`);
  }
  if (details && details.comment) {
    lines.push(`Комментарий: ${details.comment}`);
  }
  if ((draft.fulfillment_type || '') === 'delivery') {
    if (typeof details.delivery_cost !== 'undefined') {
      lines.push(`Стоимость доставки: ${formatMoney(details.delivery_cost || 0)} ₽`);
    }
    if (typeof details.delivery_paid !== 'undefined') {
      lines.push(`Оплата доставки: ${details.delivery_paid ? 'оплачено' : 'не оплачено'}`);
    }
  }
  if (typeof draft.total_cost !== 'undefined') {
    const tc = Number(draft.total_cost || 0);
    const pa = Number(draft.paid_amount || 0);
    const rem = Math.max(tc - pa, 0);
    lines.push(`Стоимость: ${formatMoney(tc)} ₽`);
    if (draft.payment_status_name) lines.push(`Статус оплаты: ${draft.payment_status_name}`);
    lines.push(`Оплачено: ${formatMoney(pa)} ₽`);
    lines.push(`Остаток: ${formatMoney(rem)} ₽`);
  }
  lines.push(`Клиент: ${contacts.client_name}, ${contacts.client_phone}`);
  if ((draft.fulfillment_type || '') === 'delivery') {
    const rn = contacts.recipient_name || '';
    const rp = contacts.recipient_phone || '';
    const ra = contacts.recipient_address || '';
    lines.push(`Получатель: ${rn}${rn && (rp || ra) ? ', ' : ''}${rp}${(rp && ra) ? ', ' : ''}${ra}`);
  }
  {
    const count = (Array.isArray(photos) ? photos.filter(Boolean).length : 0) + (cardPhoto ? 1 : 0);
    if (count > 0) lines.push(`Фото: ${count}`);
  }
  return lines.join('\n');
}

async function handleConfirmOrEdit(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  if (data === 'order_confirm') {
    const draft = st.data.draft;
    const details = st.data.details || {};
    const photos = st.data.photos || [];
    const contacts = st.data.contacts || {};
    const cardPhoto = st.data.card_photo || null;
    try {
      const existingId = st.data.order_id;
      const isActivation = !!existingId && (st.data.created_from_draft === true);
      let finalId = existingId;
      if (existingId) {
        await orderService.updateOrderAndActivate(existingId, {
          fulfillment_type: draft.fulfillment_type,
          store_name: draft.store_name,
          execution_date: draft.execution_date,
          execution_time: draft.execution_time,
          order_type: draft.order_type,
          creator_full_name: draft.creator_name || null,
          details,
          photos,
          contacts,
          card_photo: cardPhoto,
          payment_status_id: draft.payment_status_id || null,
          total_cost: draft.total_cost || 0,
          paid_amount: draft.paid_amount || 0,
        });
      } else {
        finalId = await orderService.createOrder(st.data.user.id, {
          fulfillment_type: draft.fulfillment_type,
          store_name: draft.store_name,
          execution_date: draft.execution_date,
          execution_time: draft.execution_time,
          order_type: draft.order_type,
          creator_full_name: draft.creator_name || null,
          details,
          photos,
          contacts,
          card_photo: cardPhoto,
          payment_status_id: draft.payment_status_id || null,
          total_cost: draft.total_cost || 0,
          paid_amount: draft.paid_amount || 0,
        });
      }
      let typeCalled2 = '';
      try {
        typeCalled2 = draft.order_type ? (await orderService.getOrderTypeCalledByName(draft.order_type)) || '' : '';
      } catch (_) {}
      const summaryText = buildSummary(draft, details, photos, contacts, cardPhoto, finalId, typeCalled2);
      if (existingId && !isActivation) {
        try {
          const rows = await orderService.getOrderChannelMessages(existingId);
          for (const r of rows) {
            const cid = String(r.chat_id || '');
            const mid = parseInt(r.message_id, 10);
            if (isValidChannelId(cid) && Number.isFinite(mid) && mid > 0) {
              await editMessageInChannel(cid, mid, summaryText);
            }
          }
        } catch (editErr) {
          logger.error('Order edit channel messages error', editErr);
        }
      } else if (!existingId) {
        // channel sending moved after success message
      }
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user: st.data.user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
      if (existingId && !isActivation) {
        await bot.sendMessage(chatId, `✅ Заказ обновлен. ID заказа: ${finalId}`);
      } else {
        await bot.sendMessage(chatId, `✅ Заказ создан. ID заказа: ${finalId}`);
      }
      const rightsName = st.data.user.rights_name;
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
      if (existingId && !isActivation) {
        try {
          const o = await orderService.getOrderWithDetails(finalId);
          if (o) {
            const detObj = (o.details && typeof o.details === 'object') ? o.details : {};
            const lines2 = [];
            lines2.push(`Были внесены изменения! Заказ №${finalId}`);
            lines2.push(`Тип получения: ${o.fulfillment_type === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
            lines2.push(`Магазин: ${o.address_name}`);
            lines2.push(`Дата: ${formatDateRu(o.execution_date)}`);
            lines2.push(`Время: ${formatTimeHM(o.execution_time)}`);
            lines2.push(`Тип заказа: ${o.order_type_called || ''}`);
            if (o.creator_full_name) {
              lines2.push(`Оформил: ${o.creator_full_name}`);
            }
            if (o.card_photo) {
              lines2.push('Открытка: фото добавлено');
            } else if (detObj.card_text) {
              lines2.push(`Открытка: ${detObj.card_text}`);
            }
            if (typeof o.total_cost !== 'undefined') {
              const tc = Number(o.total_cost || 0);
              const pa = Number(o.paid_amount || 0);
              const rem = Math.max(tc - pa, 0);
              if ((o.fulfillment_type || '') === 'delivery') {
                const dc = (typeof detObj.delivery_cost !== 'undefined') ? Number(detObj.delivery_cost || 0) : undefined;
                if (typeof dc !== 'undefined') {
                  lines2.push(`Стоимость доставки: ${formatMoney(dc)} ₽`);
                }
                if (typeof detObj.delivery_paid !== 'undefined') {
                  lines2.push(`Оплата доставки: ${detObj.delivery_paid ? 'оплачено' : 'не оплачено'}`);
                }
              }
              lines2.push(`Стоимость: ${formatMoney(tc)} ₽`);
              if (o.payment_status_name) lines2.push(`Статус оплаты: ${o.payment_status_name}`);
              lines2.push(`Оплачено: ${formatMoney(pa)} ₽`);
              lines2.push(`Остаток: ${formatMoney(rem)} ₽`);
            }
            lines2.push(`Контакты:`);
            lines2.push(`Клиент: ${o.client_name}, ${o.client_phone}`);
            if (o.fulfillment_type !== 'pickup') {
              lines2.push(`Получатель: ${o.recipient_name}, ${o.recipient_phone}${o.recipient_address ? ', ' + o.recipient_address : ''}`);
            }
            {
              const fidList = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
              const count = fidList.length + (o.card_photo ? 1 : 0);
              if (count > 0) lines2.push(`Фото: ${count}`);
            }
            const msgText2 = lines2.join('\n');
            try {
              const addrName2 = String(o.address_name || '');
              const direct2 = resolveChannelForStore(addrName2);
              const fallback2 = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
              const addrChannel2 = direct2 || fallback2 || '';
              if (addrChannel2 && isValidChannelId(addrChannel2)) {
                await sendToChannel(addrChannel2, msgText2);
                const fidList2 = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
                if (fidList2.length === 1) {
                  await sendPhotoToChannel(addrChannel2, fidList2[0]);
                } else if (fidList2.length > 1) {
                  await sendMediaGroupToChannel(addrChannel2, fidList2);
                }
                if (o.card_photo) {
                  await sendPhotoToChannel(addrChannel2, o.card_photo);
                }
              } else {
                logger.error(`Order ${finalId}: address channel not configured for "${addrName2}"`);
              }
            } catch (sendErrA) {
              logger.error('Order edit send to address channel error', sendErrA);
            }
            try {
              const isTestStore2 = String(o.address_name || '').toLowerCase() === 'тестовый магазин';
              if (!isTestStore2 && ADMIN_CHANNEL_ID && isValidChannelId(ADMIN_CHANNEL_ID)) {
                await sendToChannel(ADMIN_CHANNEL_ID, msgText2);
                const fidList3 = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
                if (fidList3.length === 1) {
                  await sendPhotoToChannel(ADMIN_CHANNEL_ID, fidList3[0]);
                } else if (fidList3.length > 1) {
                  await sendMediaGroupToChannel(ADMIN_CHANNEL_ID, fidList3);
                }
                if (o.card_photo) {
                  await sendPhotoToChannel(ADMIN_CHANNEL_ID, o.card_photo);
                }
              } else if (!isTestStore2) {
                logger.error(`Order ${finalId}: admin channel not configured`);
              }
            } catch (sendErrB) {
              logger.error('Order edit send to admin channel error', sendErrB);
            }
          }
        } catch (buildErr) {
          logger.error('Order edit build/send message error', buildErr);
        }
      }
      if (!existingId || isActivation) {
        try {
          const addr = String(draft.store_name || '');
          const direct = resolveChannelForStore(addr);
          const fallback = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
          const addrChannel = direct || fallback || '';
          if (!addrChannel) {
            logger.error(`Order ${finalId}: address channel is not configured for "${addr}"`);
          } else if (!isValidChannelId(addrChannel)) {
            logger.error(`Order ${finalId}: invalid address channel id "${addrChannel}" for "${addr}"`);
          } else {
            const msg = await sendToChannel(addrChannel, summaryText);
            const mid = (msg && (msg.message_id || (msg.result && msg.result.message_id))) ? (msg.message_id || msg.result.message_id) : null;
            if (mid) {
              try { await orderService.upsertOrderChannelMessage(finalId, 'address', addrChannel, mid); } catch (e) { logger.error('upsertOrderChannelMessage address error', e); }
            }
            logger.info(`Order ${finalId} sent to address channel ${addrChannel}`);
          }
        } catch (sendErr) {
          logger.error('Order send to address channel error', sendErr);
        }
        try {
          const isTestStore = String(draft.store_name || '').toLowerCase() === 'тестовый магазин';
          if (!ADMIN_CHANNEL_ID && !isTestStore) {
            logger.error(`Order ${finalId}: admin channel not configured`);
          } else if (!isTestStore && !isValidChannelId(ADMIN_CHANNEL_ID)) {
            logger.error(`Order ${finalId}: invalid admin channel id "${ADMIN_CHANNEL_ID}"`);
          } else if (!isTestStore) {
            const msg = await sendToChannel(ADMIN_CHANNEL_ID, summaryText);
            const mid = (msg && (msg.message_id || (msg.result && msg.result.message_id))) ? (msg.message_id || msg.result.message_id) : null;
            if (mid) {
              try { await orderService.upsertOrderChannelMessage(finalId, 'admin', ADMIN_CHANNEL_ID, mid); } catch (e) { logger.error('upsertOrderChannelMessage admin error', e); }
            }
            logger.info(`Order ${finalId} sent to admin channel ${ADMIN_CHANNEL_ID}`);
          }
        } catch (sendErr2) {
          logger.error('Order send to admin channel error', sendErr2);
        }
        try {
          const addr = String(draft.store_name || '');
          const direct = resolveChannelForStore(addr);
          const fallback = process.env.ORDER_CHANNEL_ID || process.env.REPORT_CHANNEL_ID;
          const addrChannel = direct || fallback || '';
          if (addrChannel && isValidChannelId(addrChannel)) {
            const fidList = (Array.isArray(photos) ? photos : []).filter(Boolean);
            if (fidList.length === 1) {
              await sendPhotoToChannel(addrChannel, fidList[0]);
            } else if (fidList.length > 1) {
              await sendMediaGroupToChannel(addrChannel, fidList);
            }
            if (cardPhoto) {
              await sendPhotoToChannel(addrChannel, cardPhoto);
            }
          }
        } catch (sendPhotoErr) {
          logger.error('Order photos send to address channel error', sendPhotoErr);
        }
        try {
          const isTestStore = String(draft.store_name || '').toLowerCase() === 'тестовый магазин';
          if (!isTestStore && ADMIN_CHANNEL_ID && isValidChannelId(ADMIN_CHANNEL_ID)) {
            const fidList = (Array.isArray(photos) ? photos : []).filter(Boolean);
            if (fidList.length === 1) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, fidList[0]);
            } else if (fidList.length > 1) {
              await sendMediaGroupToChannel(ADMIN_CHANNEL_ID, fidList);
            }
            if (cardPhoto) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, cardPhoto);
            }
          }
        } catch (sendPhotoErr2) {
          logger.error('Order photos send to admin channel error', sendPhotoErr2);
        }
      }
    } catch (e) {
      logger.error('Confirm order error', e);
      await bot.sendMessage(chatId, '❌ Не удалось создать заказ. Попробуйте позже.');
    }
  } else if (data === 'order_edit') {
    const st2 = getUserState(userId);
    const kb = buildEditKeyboardFromState(st2.data);
    setUserState(userId, 'order_edit_select', { user: st2.data.user, draft: st2.data.draft, details: st2.data.details, photos: st2.data.photos, contacts: st2.data.contacts, order_id: st2.data.order_id, created_from_draft: st2.data.created_from_draft || false });
    await bot.sendMessage(chatId, 'Выберите деталь для изменения:', kb);
  }
}

module.exports = {
  handleOrderCreate,
  handleOrderManage,
  handleCallback,
  handleOrderMessage,
  handleConfirmOrEdit,
};
