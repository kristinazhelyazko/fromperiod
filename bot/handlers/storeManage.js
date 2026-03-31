const { getUserState, setUserState } = require('./auth');
const pool = require('../../config/database');
const logger = require('../../utils/logger');
const { sendToChannel, sendPhotoToChannel, getBot } = require('../../services/telegramService');
const fs = require('fs');
const path = require('path');
const { getConfirmKeyboard } = require('../keyboards');

const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1003345446030';
const STORE_CHANNEL_MAP = {
  'Белгород': '-1003868788094',
  'Строитель': '-1002136516687',
  'Северный': '-1002144814016',
  'Тестовый магазин': '-5159177330',
};
const ITEMS_PAGE_SIZE = 10;

function elementsDir() {
  // In docker-compose we bind-mount ./elements to /app/elements for both web and bot.
  return path.join(process.cwd(), 'elements');
}

function guessExtFromPath(p) {
  const ext = path.extname(String(p || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return ext;
  return '.jpg';
}

async function downloadTelegramPhotoToElements(fileId, prefix = 'ci') {
  const bot = getBot();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!bot) throw new Error('Telegram bot instance not available');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const file = await bot.getFile(fileId);
  const filePath = file && file.file_path;
  if (!filePath) throw new Error('Telegram getFile returned empty file_path');

  const ext = guessExtFromPath(filePath);
  const name = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
  const dir = elementsDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const abs = path.join(dir, name);

  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Telegram file download failed: HTTP ${res.status} ${txt}`.trim());
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(abs, buf);
  return { publicPath: `/elements/${name}`, filename: name, absPath: abs };
}

function isValidChannelId(id) {
  return /^-\d+$/.test(String(id || ''));
}

function resolveChannelForAddress(name) {
  const key = String(name || '').trim().toLowerCase();
  if (key === 'белгород') return STORE_CHANNEL_MAP['Белгород'];
  if (key === 'строитель') return STORE_CHANNEL_MAP['Строитель'];
  if (key === 'северный') return STORE_CHANNEL_MAP['Северный'];
  if (key === 'тестовый магазин') return STORE_CHANNEL_MAP['Тестовый магазин'];
  return STORE_CHANNEL_MAP[name] || null;
}

function withMainMenuButton(rows) {
  return [...rows, [{ text: '🏠 Главное меню', callback_data: 'back_menu' }]];
}

async function listVisibleStoreAddresses() {
  const result = await pool.query(
    'SELECT id, name FROM address WHERE is_visible_in_store = TRUE ORDER BY name'
  );
  return result.rows || [];
}

async function listCatalogSections(selectedAddressId) {
  const addressId = Number.parseInt(String(selectedAddressId || ''), 10);
  if (Number.isInteger(addressId) && addressId > 0) {
    const filtered = await pool.query(
      'SELECT id, name FROM catalog_section WHERE address_id IS NULL OR address_id = $1 ORDER BY name',
      [addressId]
    );
    return filtered.rows || [];
  }
  const result = await pool.query('SELECT id, name FROM catalog_section ORDER BY name');
  return result.rows || [];
}

async function getAddressName(addressId) {
  if (Number(addressId) === 0) return 'Для всех магазинов';
  const rs = await pool.query('SELECT name FROM address WHERE id = $1', [addressId]);
  return (rs.rows[0] && rs.rows[0].name) || `Адрес ${addressId}`;
}

async function getSectionName(sectionId) {
  const rs = await pool.query('SELECT name FROM catalog_section WHERE id = $1', [sectionId]);
  return (rs.rows[0] && rs.rows[0].name) || `Раздел ${sectionId}`;
}

async function buildCatalogItemText(item) {
  const addressName = await getAddressName(item.address_id);
  const sectionName = item.section_id ? await getSectionName(item.section_id) : 'Не выбран';
  const visible = Number(item.is_visible) === 1 || item.is_visible === true ? 'Да' : 'Нет';
  return [
    'Карточка товара:',
    `ID: ${item.id || 'новый'}`,
    `Наименование: ${item.name || '-'}`,
    `Цена: ${item.price || 0}`,
    `Отображение: ${visible}`,
    `Магазин: ${addressName}`,
    `Раздел: ${sectionName}`,
    `Фото: ${item.image_path ? 'есть' : 'нет'}`,
  ].join('\n');
}

function buildManageAddressesKeyboard(addresses) {
  const rows = addresses.map((a) => [{ text: a.name, callback_data: `store_manage_addr_${a.id}` }]);
  return { reply_markup: { inline_keyboard: withMainMenuButton(rows) } };
}

function buildCreateAddressKeyboard(addresses) {
  const rows = [[{ text: 'Для всех магазинов', callback_data: 'store_manage_create_addr_0' }]];
  for (const a of addresses) {
    rows.push([{ text: a.name, callback_data: `store_manage_create_addr_${a.id}` }]);
  }
  return { reply_markup: { inline_keyboard: withMainMenuButton(rows) } };
}

async function showStoreManageAddresses(bot, chatId, userId) {
  const addresses = await listVisibleStoreAddresses();
  const st = getUserState(userId);
  setUserState(userId, 'store_manage_address_select', {
    user: st.data.user,
  });
  await bot.sendMessage(chatId, 'Управление магазином: выберите адрес.', buildManageAddressesKeyboard(addresses));
}

async function showStoreManageActions(bot, chatId, userId, selectedAddressId) {
  const st = getUserState(userId);
  const selectedAddressName = await getAddressName(selectedAddressId);
  setUserState(userId, 'store_manage_actions', {
    user: st.data.user,
    store_manage_selected_address_id: selectedAddressId,
    store_manage_selected_address_name: selectedAddressName,
  });
  await bot.sendMessage(chatId, `Выбран магазин: ${selectedAddressName}`, {
    reply_markup: {
      inline_keyboard: withMainMenuButton([
        [{ text: '➕ Создать новый товар', callback_data: 'store_manage_action_create' }],
        [{ text: '✏️ Редактирование/удаление', callback_data: 'store_manage_action_edit' }],
      ]),
    },
  });
}

async function showCreateSectionSelection(bot, chatId, userId) {
  const st = getUserState(userId);
  const draftAddressId = Number((st.data.store_manage_draft || {}).address_id || 0);
  const sections = await listCatalogSections(draftAddressId);
  const rows = sections.map((s) => [{ text: s.name, callback_data: `store_manage_create_section_${s.id}` }]);
  setUserState(userId, 'store_manage_create_section', st.data);
  await bot.sendMessage(chatId, 'Выберите раздел товара:', {
    reply_markup: { inline_keyboard: withMainMenuButton(rows.length ? rows : [[{ text: 'Нет разделов', callback_data: 'noop' }]]) },
  });
}

async function showDraftPreview(bot, chatId, userId) {
  const st = getUserState(userId);
  const draft = st.data.store_manage_draft || {};
  const text = await buildCatalogItemText({ ...draft, id: null, is_visible: true });
  const keyboard = {
    reply_markup: {
      inline_keyboard: withMainMenuButton([
        [{ text: '✅ Сохранить', callback_data: 'store_manage_draft_save' }],
        [{ text: '✏️ Редактировать', callback_data: 'store_manage_draft_edit' }],
        [{ text: '🗑 Удалить', callback_data: 'store_manage_draft_delete' }],
      ]),
    },
  };
  setUserState(userId, 'store_manage_preview', st.data);
  if (draft.image_path) {
    // draft.image_path is a public /elements/... path; for telegram preview we can still send stored telegram file_id if present.
    // If we don't have file_id, just send text.
    if (draft.telegram_file_id) {
      await bot.sendPhoto(chatId, draft.telegram_file_id, { caption: text, ...keyboard });
      return;
    }
    await bot.sendMessage(chatId, text, keyboard);
    return;
  }
  await bot.sendMessage(chatId, text, keyboard);
}

async function showDraftEditFields(bot, chatId, userId) {
  const st = getUserState(userId);
  setUserState(userId, 'store_manage_edit_draft_field', st.data);
  await bot.sendMessage(chatId, 'Выберите поле для редактирования:', {
    reply_markup: {
      inline_keyboard: withMainMenuButton([
        [{ text: 'Наименование', callback_data: 'store_manage_draft_field_name' }],
        [{ text: 'Цена', callback_data: 'store_manage_draft_field_price' }],
        [{ text: 'Отображение', callback_data: 'store_manage_draft_field_visible' }],
        [{ text: 'Магазин', callback_data: 'store_manage_draft_field_address' }],
        [{ text: 'Раздел', callback_data: 'store_manage_draft_field_section' }],
        [{ text: 'Фотография', callback_data: 'store_manage_draft_field_image' }],
        [{ text: '⬅️ К карточке', callback_data: 'store_manage_draft_back_preview' }],
      ]),
    },
  });
}

async function createCatalogItemFromDraft(userId) {
  const st = getUserState(userId);
  const user = st.data.user || {};
  const d = st.data.store_manage_draft || {};
  // If catalog_item rows were manually inserted with explicit ids, sequence may lag behind.
  // Ensure nextval won't collide with existing primary keys.
  await pool.query(
    "SELECT setval(pg_get_serial_sequence('catalog_item','id'), (SELECT COALESCE(MAX(id), 0) FROM catalog_item))"
  );
  const result = await pool.query(
    `INSERT INTO catalog_item (name, price, image_path, is_visible, address_id, section_id, created_by_user_id)
     VALUES ($1, $2, $3, TRUE, $4, $5, $6)
     RETURNING id, name, price, image_path, is_visible, address_id, section_id, created_by_user_id`,
    [d.name, d.price, d.image_path, d.address_id, d.section_id, user.id || null]
  );
  const item = result.rows[0];
  // Persist cover photo into multi-photo table when available.
  if (item && item.image_path) {
    try {
      await pool.query(
        'INSERT INTO catalog_item_photo (catalog_item_id, image_path, sort_order) VALUES ($1, $2, 1)',
        [item.id, item.image_path]
      );
    } catch (e) {
      logger.warn('catalog_item_photo insert failed (continuing)', e);
    }
  }
  return item;
}

async function notifyItemCreated(item) {
  const addressName = await getAddressName(item.address_id);
  const sectionName = item.section_id ? await getSectionName(item.section_id) : 'Не выбран';
  const text = [
    'Создан новый товар в магазине',
    `ID: ${item.id}`,
    `Наименование: ${item.name}`,
    `Цена: ${item.price}`,
    `Магазин: ${addressName}`,
    `Раздел: ${sectionName}`,
    `Отображение: ${item.is_visible ? 'Да' : 'Нет'}`,
  ].join('\n');

  if (Number(item.address_id) !== 0) {
    const channelId = resolveChannelForAddress(addressName);
    if (channelId && isValidChannelId(channelId)) {
      try {
        await sendToChannel(channelId, text);
        if (item.image_path) {
          const p = String(item.image_path || '');
          const isElements = p.startsWith('/elements/');
          const localPath = isElements ? path.join(process.cwd(), p.replace(/^\//, '')) : p;
          await sendPhotoToChannel(channelId, localPath, { caption: text });
        }
      } catch (e) {
        // Don't break user flow on channel issues.
      }
    }
  }
  if (ADMIN_CHANNEL_ID && isValidChannelId(ADMIN_CHANNEL_ID)) {
    try {
      await sendToChannel(ADMIN_CHANNEL_ID, text);
      if (item.image_path) {
        const p = String(item.image_path || '');
        const isElements = p.startsWith('/elements/');
        const localPath = isElements ? path.join(process.cwd(), p.replace(/^\//, '')) : p;
        await sendPhotoToChannel(ADMIN_CHANNEL_ID, localPath, { caption: text });
      }
    } catch (e) {
      // Don't break user flow on channel issues.
    }
  }
}

async function showSectionSelectionForEdit(bot, chatId, userId) {
  const st = getUserState(userId);
  const selectedAddressId = Number(st.data.store_manage_selected_address_id || 0);
  const sections = await listCatalogSections(selectedAddressId);
  const rows = sections.map((s) => [{ text: s.name, callback_data: `store_manage_edit_section_${s.id}` }]);
  setUserState(userId, 'store_manage_section_select', st.data);
  await bot.sendMessage(chatId, 'Выберите раздел:', {
    reply_markup: { inline_keyboard: withMainMenuButton(rows.length ? rows : [[{ text: 'Нет разделов', callback_data: 'noop' }]]) },
  });
}

async function showItemsPage(bot, chatId, userId, sectionId, page) {
  const st = getUserState(userId);
  const selectedAddressId = Number(st.data.store_manage_selected_address_id || 0);
  const offset = (page - 1) * ITEMS_PAGE_SIZE;
  const result = await pool.query(
    `SELECT id, name, price, is_visible
     FROM catalog_item
     WHERE section_id = $1
       AND ($2 = 0 OR address_id = 0 OR address_id = $2)
     ORDER BY is_visible DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [sectionId, selectedAddressId, ITEMS_PAGE_SIZE + 1, offset]
  );
  const hasNext = result.rows.length > ITEMS_PAGE_SIZE;
  const items = hasNext ? result.rows.slice(0, ITEMS_PAGE_SIZE) : result.rows;
  const rows = items.map((it) => {
    const visible = it.is_visible === true || Number(it.is_visible) === 1;
    const icon = visible ? '✅' : '❌';
    return [{ text: `${icon} ${it.name} — ${it.price}`, callback_data: `store_manage_item_${it.id}` }];
  });
  const nav = [];
  if (page > 1) nav.push({ text: '◀️ Назад', callback_data: 'store_manage_items_prev' });
  if (hasNext) nav.push({ text: 'Вперёд ▶️', callback_data: 'store_manage_items_next' });
  if (nav.length) rows.push(nav);
  const sectionName = await getSectionName(sectionId);

  setUserState(userId, 'store_manage_items_list', {
    ...st.data,
    store_manage_section_id: sectionId,
    store_manage_items_page: page,
  });
  await bot.sendMessage(chatId, `Раздел: ${sectionName}. Выберите товар:`, {
    reply_markup: { inline_keyboard: withMainMenuButton(rows.length ? rows : [[{ text: 'Нет товаров', callback_data: 'noop' }]]) },
  });
}

async function showCatalogItemCard(bot, chatId, userId, itemId) {
  const rs = await pool.query(
    `SELECT
       ci.id,
       ci.name,
       ci.price,
       COALESCE(
         (SELECT cip.image_path
          FROM catalog_item_photo cip
          WHERE cip.catalog_item_id = ci.id
          ORDER BY cip.sort_order
          LIMIT 1),
         ci.image_path
       ) AS image_path,
       ci.is_visible,
       ci.address_id,
       ci.section_id
     FROM catalog_item ci
     WHERE ci.id = $1`,
    [itemId]
  );
  if (!rs.rows[0]) {
    await bot.sendMessage(chatId, 'Товар не найден.');
    return;
  }
  const item = rs.rows[0];
  const text = await buildCatalogItemText(item);
  const keyboard = {
    reply_markup: {
      inline_keyboard: withMainMenuButton([
        [{ text: 'Наименование', callback_data: `store_manage_item_field_name_${itemId}` }],
        [{ text: 'Цена', callback_data: `store_manage_item_field_price_${itemId}` }],
        [{ text: 'Отображение', callback_data: `store_manage_item_field_visible_${itemId}` }],
        [{ text: 'Магазин', callback_data: `store_manage_item_field_address_${itemId}` }],
        [{ text: 'Раздел', callback_data: `store_manage_item_field_section_${itemId}` }],
        [{ text: 'Фотография', callback_data: `store_manage_item_field_image_${itemId}` }],
        [{ text: '🗑 Удалить товар', callback_data: `store_manage_item_delete_${itemId}` }],
      ]),
    },
  };
  const st = getUserState(userId);
  setUserState(userId, 'store_manage_item_view', {
    ...st.data,
    store_manage_item_id: itemId,
  });
  const p = String(item.image_path || '').trim();
  if (p) {
    try {
      const isElements = p.startsWith('/elements/');
      const localPath = isElements ? path.join(process.cwd(), p.replace(/^\//, '')) : p;
      if (fs.existsSync(localPath)) {
        await bot.sendPhoto(chatId, localPath, { caption: text, reply_markup: keyboard.reply_markup });
        return;
      }
      // Fall back to text if file missing.
    } catch (e) {
      // Fall back to text if photo sending fails.
    }
  }
  await bot.sendMessage(chatId, text, keyboard);
}

async function applyDraftFieldChangeByText(bot, chatId, userId, stateName, text) {
  const st = getUserState(userId);
  const draft = { ...(st.data.store_manage_draft || {}) };
  if (stateName === 'store_manage_edit_draft_name') {
    draft.name = text.trim();
  } else if (stateName === 'store_manage_edit_draft_price') {
    const price = Number.parseInt(text.trim(), 10);
    if (!Number.isFinite(price) || price <= 0) {
      await bot.sendMessage(chatId, 'Введите корректную стоимость (целое число).');
      return;
    }
    draft.price = price;
  }
  setUserState(userId, 'store_manage_preview', { ...st.data, store_manage_draft: draft });
  await showDraftPreview(bot, chatId, userId);
}

async function applyItemFieldChangeByText(bot, chatId, userId, stateName, text) {
  const st = getUserState(userId);
  const itemId = Number(st.data.store_manage_item_id || 0);
  if (!itemId) return;
  if (stateName === 'store_manage_item_edit_name') {
    await pool.query('UPDATE catalog_item SET name = $1 WHERE id = $2', [text.trim(), itemId]);
  } else if (stateName === 'store_manage_item_edit_price') {
    const price = Number.parseInt(text.trim(), 10);
    if (!Number.isFinite(price) || price <= 0) {
      await bot.sendMessage(chatId, 'Введите корректную стоимость (целое число).');
      return;
    }
    await pool.query('UPDATE catalog_item SET price = $1 WHERE id = $2', [price, itemId]);
  }
  await showCatalogItemCard(bot, chatId, userId, itemId);
}

async function handleStoreManageStart(bot, ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  if (!st.data || !st.data.user) {
    await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
    return;
  }
  await showStoreManageAddresses(bot, chatId, userId);
}

async function handleStoreManageCallback(bot, ctx, data) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const st = getUserState(userId);
  try {
    if (data.startsWith('store_manage_addr_')) {
      const addressId = Number.parseInt(data.substring('store_manage_addr_'.length), 10);
      if (!Number.isFinite(addressId)) return;
      await showStoreManageActions(bot, chatId, userId, addressId);
      return;
    }
    if (data === 'store_manage_action_create') {
      const addresses = await listVisibleStoreAddresses();
      setUserState(userId, 'store_manage_create_address', st.data);
      await bot.sendMessage(chatId, 'Выберите адрес для товара:', buildCreateAddressKeyboard(addresses));
      return;
    }
    if (data.startsWith('store_manage_create_addr_')) {
      const addressId = Number.parseInt(data.substring('store_manage_create_addr_'.length), 10);
      if (!Number.isFinite(addressId) || addressId < 0) return;
      if (st.state === 'store_manage_edit_draft_address') {
        const draft = { ...(st.data.store_manage_draft || {}), address_id: addressId };
        setUserState(userId, 'store_manage_preview', { ...st.data, store_manage_draft: draft });
        await showDraftPreview(bot, chatId, userId);
        return;
      }
      setUserState(userId, 'store_manage_create_section', {
        ...st.data,
        store_manage_draft: {
          address_id: addressId,
          is_visible: true,
        },
      });
      await showCreateSectionSelection(bot, chatId, userId);
      return;
    }
    if (data.startsWith('store_manage_create_section_')) {
      const sectionId = Number.parseInt(data.substring('store_manage_create_section_'.length), 10);
      if (!Number.isFinite(sectionId)) return;
      const draft = { ...(st.data.store_manage_draft || {}), section_id: sectionId };
      setUserState(userId, 'store_manage_create_name', { ...st.data, store_manage_draft: draft });
      await bot.sendMessage(chatId, 'Введите наименование товара:');
      return;
    }
    if (data === 'store_manage_draft_save') {
      const item = await createCatalogItemFromDraft(userId);
      await bot.sendMessage(chatId, '✅ Новый товар в каталоге успешно создан.');
      await notifyItemCreated(item);
      await showStoreManageAddresses(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_edit') {
      await showDraftEditFields(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_delete') {
      await bot.sendMessage(
        chatId,
        'Вы точно хотите выполнить действие?',
        getConfirmKeyboard('store_manage_draft_delete_yes', 'store_manage_draft_delete_no')
      );
      return;
    }
    if (data === 'store_manage_draft_delete_no') {
      await bot.sendMessage(chatId, 'Действие отменено.');
      await showDraftPreview(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_delete_yes') {
      setUserState(userId, 'store_manage_actions', {
        user: st.data.user,
        store_manage_selected_address_id: st.data.store_manage_selected_address_id,
        store_manage_selected_address_name: st.data.store_manage_selected_address_name,
      });
      await bot.sendMessage(chatId, 'Черновик товара удален.');
      return;
    }
    if (data === 'store_manage_draft_back_preview') {
      await showDraftPreview(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_field_name') {
      setUserState(userId, 'store_manage_edit_draft_name', st.data);
      await bot.sendMessage(chatId, 'Введите новое наименование товара:');
      return;
    }
    if (data === 'store_manage_draft_field_price') {
      setUserState(userId, 'store_manage_edit_draft_price', st.data);
      await bot.sendMessage(chatId, 'Введите новую стоимость товара:');
      return;
    }
    if (data === 'store_manage_draft_field_visible') {
      await bot.sendMessage(chatId, 'Выберите отображение товара:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Показывать', callback_data: 'store_manage_draft_visible_1' }],
            [{ text: 'Скрыть', callback_data: 'store_manage_draft_visible_0' }],
          ],
        },
      });
      return;
    }
    if (data.startsWith('store_manage_draft_visible_')) {
      const visible = data.endsWith('_1');
      const draft = { ...(st.data.store_manage_draft || {}), is_visible: visible };
      setUserState(userId, 'store_manage_preview', { ...st.data, store_manage_draft: draft });
      await showDraftPreview(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_field_address') {
      const addresses = await listVisibleStoreAddresses();
      await bot.sendMessage(chatId, 'Выберите новый адрес товара:', buildCreateAddressKeyboard(addresses));
      setUserState(userId, 'store_manage_edit_draft_address', st.data);
      return;
    }
    if (data === 'store_manage_draft_field_section') {
      const draftAddressId = Number((st.data.store_manage_draft || {}).address_id || 0);
      const sections = await listCatalogSections(draftAddressId);
      const rows = sections.map((s) => [{ text: s.name, callback_data: `store_manage_draft_section_${s.id}` }]);
      setUserState(userId, 'store_manage_edit_draft_section', st.data);
      await bot.sendMessage(chatId, 'Выберите новый раздел:', {
        reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет разделов', callback_data: 'noop' }]] },
      });
      return;
    }
    if (data.startsWith('store_manage_draft_section_')) {
      const sectionId = Number.parseInt(data.substring('store_manage_draft_section_'.length), 10);
      const draft = { ...(st.data.store_manage_draft || {}), section_id: sectionId };
      setUserState(userId, 'store_manage_preview', { ...st.data, store_manage_draft: draft });
      await showDraftPreview(bot, chatId, userId);
      return;
    }
    if (data === 'store_manage_draft_field_image') {
      setUserState(userId, 'store_manage_edit_draft_photo', st.data);
      await bot.sendMessage(chatId, 'Отправьте 1 фотографию товара, обязательно поставьте галочку "Сжать изображение".');
      return;
    }
    if (data === 'store_manage_action_edit') {
      await showSectionSelectionForEdit(bot, chatId, userId);
      return;
    }
    if (data.startsWith('store_manage_edit_section_')) {
      const sectionId = Number.parseInt(data.substring('store_manage_edit_section_'.length), 10);
      if (!Number.isFinite(sectionId)) return;
      await showItemsPage(bot, chatId, userId, sectionId, 1);
      return;
    }
    if (data === 'store_manage_items_prev' || data === 'store_manage_items_next') {
      const page = Number(st.data.store_manage_items_page || 1);
      const sectionId = Number(st.data.store_manage_section_id || 0);
      if (!sectionId) return;
      const newPage = data.endsWith('_next') ? page + 1 : Math.max(1, page - 1);
      await showItemsPage(bot, chatId, userId, sectionId, newPage);
      return;
    }
    if (data.startsWith('store_manage_item_delete_no_')) {
      const itemId = Number.parseInt(data.substring('store_manage_item_delete_no_'.length), 10);
      if (!Number.isFinite(itemId)) return;
      await bot.sendMessage(chatId, 'Действие отменено.');
      await showCatalogItemCard(bot, chatId, userId, itemId);
      return;
    }
    if (data.startsWith('store_manage_item_delete_yes_')) {
      const itemId = Number.parseInt(data.substring('store_manage_item_delete_yes_'.length), 10);
      if (!Number.isFinite(itemId)) return;
      await pool.query('DELETE FROM catalog_item WHERE id = $1', [itemId]);
      await bot.sendMessage(chatId, 'Товар удален.');
      await showSectionSelectionForEdit(bot, chatId, userId);
      return;
    }
    if (data.startsWith('store_manage_item_delete_')) {
      const itemId = Number.parseInt(data.substring('store_manage_item_delete_'.length), 10);
      if (!Number.isFinite(itemId)) return;
      await bot.sendMessage(
        chatId,
        'Вы точно хотите выполнить действие?',
        getConfirmKeyboard(`store_manage_item_delete_yes_${itemId}`, `store_manage_item_delete_no_${itemId}`)
      );
      return;
    }
    if (data.startsWith('store_manage_item_field_')) {
      const parts = data.split('_');
      const field = parts[4];
      const itemId = Number.parseInt(parts[5], 10);
      if (!Number.isFinite(itemId)) return;
      setUserState(userId, 'store_manage_item_view', { ...st.data, store_manage_item_id: itemId });
      if (field === 'name') {
        setUserState(userId, 'store_manage_item_edit_name', { ...st.data, store_manage_item_id: itemId });
        await bot.sendMessage(chatId, 'Введите новое наименование товара:');
        return;
      }
      if (field === 'price') {
        setUserState(userId, 'store_manage_item_edit_price', { ...st.data, store_manage_item_id: itemId });
        await bot.sendMessage(chatId, 'Введите новую стоимость товара:');
        return;
      }
      if (field === 'visible') {
        await bot.sendMessage(chatId, 'Выберите отображение товара:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Показывать', callback_data: `store_manage_item_visible_1_${itemId}` }],
              [{ text: 'Скрыть', callback_data: `store_manage_item_visible_0_${itemId}` }],
            ],
          },
        });
        return;
      }
      if (field === 'address') {
        const addresses = await listVisibleStoreAddresses();
        const rows = [[{ text: 'Для всех магазинов', callback_data: `store_manage_item_addr_0_${itemId}` }]];
        for (const a of addresses) rows.push([{ text: a.name, callback_data: `store_manage_item_addr_${a.id}_${itemId}` }]);
        await bot.sendMessage(chatId, 'Выберите новый адрес товара:', { reply_markup: { inline_keyboard: rows } });
        return;
      }
      if (field === 'section') {
        const addrRs = await pool.query('SELECT address_id FROM catalog_item WHERE id = $1', [itemId]);
        const itemAddressId = Number(((addrRs.rows[0] || {}).address_id) || 0);
        const sections = await listCatalogSections(itemAddressId);
        const rows = sections.map((s) => [{ text: s.name, callback_data: `store_manage_item_section_${s.id}_${itemId}` }]);
        await bot.sendMessage(chatId, 'Выберите новый раздел товара:', { reply_markup: { inline_keyboard: rows } });
        return;
      }
      if (field === 'image') {
        setUserState(userId, 'store_manage_item_edit_image', { ...st.data, store_manage_item_id: itemId });
        await bot.sendMessage(chatId, 'Отправьте 1 фотографию товара, обязательно поставьте галочку "Сжать изображение".');
        return;
      }
    }
    if (data.startsWith('store_manage_item_visible_')) {
      const parts = data.split('_');
      const visible = parts[4] === '1';
      const itemId = Number.parseInt(parts[5], 10);
      if (!Number.isFinite(itemId)) return;
      await pool.query('UPDATE catalog_item SET is_visible = $1 WHERE id = $2', [visible, itemId]);
      await showCatalogItemCard(bot, chatId, userId, itemId);
      return;
    }
    if (data.startsWith('store_manage_item_addr_')) {
      const parts = data.split('_');
      const addressId = Number.parseInt(parts[4], 10);
      const itemId = Number.parseInt(parts[5], 10);
      if (!Number.isFinite(addressId) || !Number.isFinite(itemId)) return;
      await pool.query('UPDATE catalog_item SET address_id = $1 WHERE id = $2', [addressId, itemId]);
      await showCatalogItemCard(bot, chatId, userId, itemId);
      return;
    }
    if (data.startsWith('store_manage_item_section_')) {
      const parts = data.split('_');
      const sectionId = Number.parseInt(parts[4], 10);
      const itemId = Number.parseInt(parts[5], 10);
      if (!Number.isFinite(sectionId) || !Number.isFinite(itemId)) return;
      await pool.query('UPDATE catalog_item SET section_id = $1 WHERE id = $2', [sectionId, itemId]);
      await showCatalogItemCard(bot, chatId, userId, itemId);
      return;
    }
    // IMPORTANT: keep this AFTER store_manage_item_visible_/addr_/section_ branches,
    // otherwise it will swallow those callbacks and do nothing.
    if (data.startsWith('store_manage_item_') && !data.includes('_field_') && !data.includes('_delete_')) {
      const itemId = Number.parseInt(data.substring('store_manage_item_'.length), 10);
      if (!Number.isFinite(itemId)) return;
      await showCatalogItemCard(bot, chatId, userId, itemId);
      return;
    }
  } catch (error) {
    logger.error('handleStoreManageCallback error', error);
    await bot.sendMessage(chatId, 'Ошибка управления магазином. Попробуйте снова.');
  }
}

async function handleStoreManageMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const st = getUserState(userId);
  const state = String(st.state || '');
  const text = String(msg.text || '');
  try {
    if (state === 'store_manage_create_name') {
      const name = text.trim();
      if (!name) {
        await bot.sendMessage(chatId, 'Наименование не может быть пустым.');
        return;
      }
      const draft = { ...(st.data.store_manage_draft || {}), name };
      setUserState(userId, 'store_manage_create_price', { ...st.data, store_manage_draft: draft });
      await bot.sendMessage(chatId, 'Введите стоимость товара:');
      return;
    }
    if (state === 'store_manage_create_price') {
      const price = Number.parseInt(text.trim(), 10);
      if (!Number.isFinite(price) || price <= 0) {
        await bot.sendMessage(chatId, 'Введите корректную стоимость (целое число).');
        return;
      }
      const draft = { ...(st.data.store_manage_draft || {}), price };
      setUserState(userId, 'store_manage_create_photo', { ...st.data, store_manage_draft: draft });
      await bot.sendMessage(chatId, 'Отправьте 1 фотографию товара, обязательно поставьте галочку "Сжать изображение".');
      return;
    }
    if (state === 'store_manage_create_photo' || state === 'store_manage_edit_draft_photo' || state === 'store_manage_item_edit_image') {
      if (!Array.isArray(msg.photo) || msg.photo.length === 0) {
        await bot.sendMessage(chatId, 'Ожидаю 1 фотографию.');
        return;
      }
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const dl = await downloadTelegramPhotoToElements(fileId, 'catalog_item');
      if (state === 'store_manage_item_edit_image') {
        const itemId = Number(st.data.store_manage_item_id || 0);
        if (!itemId) return;
        await pool.query('UPDATE catalog_item SET image_path = $1 WHERE id = $2', [dl.publicPath, itemId]);
        try {
          await pool.query('DELETE FROM catalog_item_photo WHERE catalog_item_id = $1 AND sort_order = 1', [itemId]);
          await pool.query(
            'INSERT INTO catalog_item_photo (catalog_item_id, image_path, sort_order) VALUES ($1, $2, 1)',
            [itemId, dl.publicPath]
          );
        } catch (e) {
          logger.warn('catalog_item_photo update failed (continuing)', e);
        }
        await showCatalogItemCard(bot, chatId, userId, itemId);
        return;
      }
      const draft = {
        ...(st.data.store_manage_draft || {}),
        image_path: dl.publicPath,
        telegram_file_id: fileId,
      };
      setUserState(userId, 'store_manage_preview', { ...st.data, store_manage_draft: draft });
      await showDraftPreview(bot, chatId, userId);
      return;
    }
    if (state === 'store_manage_edit_draft_name' || state === 'store_manage_edit_draft_price') {
      await applyDraftFieldChangeByText(bot, chatId, userId, state, text);
      return;
    }
    if (state === 'store_manage_item_edit_name' || state === 'store_manage_item_edit_price') {
      await applyItemFieldChangeByText(bot, chatId, userId, state, text);
    }
  } catch (error) {
    logger.error('handleStoreManageMessage error', error);
    await bot.sendMessage(chatId, 'Ошибка при обработке данных товара.');
  }
}

function isStoreManageState(state) {
  return String(state || '').startsWith('store_manage_');
}

module.exports = {
  handleStoreManageStart,
  handleStoreManageCallback,
  handleStoreManageMessage,
  isStoreManageState,
};
