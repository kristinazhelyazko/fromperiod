const { getMainMenuKeyboard } = require('../keyboards');
const { getUserState, clearUserState } = require('./auth');
const logger = require('../../utils/logger');

async function handleMainMenu(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state !== 'authenticated') {
      await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start для начала работы.');
      return;
    }

    const rightsName = userState.data.user.rights_name;
    try {
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
    } catch (error) {
      // Если ошибка из-за Web App URL, отправляем меню без Web App кнопки
      if (error.message && error.message.includes('Only HTTPS links are allowed')) {
        logger.warn('Web App URL не поддерживается (требуется HTTPS). Отправляем меню без Web App кнопки.');
        const keyboard = getMainMenuKeyboard(rightsName);
        if (keyboard.reply_markup && keyboard.reply_markup.inline_keyboard) {
          const webAppButton = keyboard.reply_markup.inline_keyboard[0];
          if (webAppButton && webAppButton[0] && webAppButton[0].web_app) {
            const url = process.env.WEB_APP_URL || 'http://localhost:3000';
            webAppButton[0] = { text: '📱 Перейти в приложение (локально)', url: url };
          }
        }
        await bot.sendMessage(chatId, '📋 Главное меню:', keyboard);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error('Error in handleMainMenu:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  handleMainMenu,
};

