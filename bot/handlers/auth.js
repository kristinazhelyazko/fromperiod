const userService = require('../../services/userService');
const { getMainMenuKeyboard, getCancelKeyboard } = require('../keyboards');
const logger = require('../../utils/logger');

// Хранилище состояний пользователей (в продакшене использовать Redis)
const userStates = new Map();

function setUserState(userId, state, data = {}) {
  userStates.set(userId, { state, data });
}

function getUserState(userId) {
  return userStates.get(userId) || { state: null, data: {} };
}

function clearUserState(userId) {
  userStates.delete(userId);
}

async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    clearUserState(userId);
    await bot.sendMessage(chatId, '👋 Добро пожаловать! Для начала работы необходимо авторизоваться.\n\nВведите ваш логин:');
    setUserState(userId, 'waiting_login');
  } catch (error) {
    logger.error('Error in handleStart:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  const userState = getUserState(userId);

  try {
    if (userState.state === 'waiting_login') {
      // Проверяем логин
      let user = null;
      try {
        user = await userService.findUserByLogin(text);
      } catch (dbErr) {
        logger.error('auth_waiting_login_db', dbErr);
        await bot.sendMessage(chatId, '❌ Ошибка авторизации. Проверьте подключение к базе данных.');
        return;
      }
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Пользователь с таким логином не найден. Попробуйте еще раз или введите /start для начала.');
        return;
      }

      // Сохраняем данные пользователя и запрашиваем пароль
      setUserState(userId, 'waiting_password', { user });
      await bot.sendMessage(chatId, '🔐 Введите ваш пароль:');
      
    } else if (userState.state === 'waiting_password') {
      // Проверяем пароль
      const { user } = userState.data;
      let isValidPassword = false;
      try {
        isValidPassword = await userService.verifyPassword(user, text);
      } catch (verErr) {
        logger.error('auth_waiting_password_verify', verErr);
        await bot.sendMessage(chatId, '❌ Ошибка проверки пароля. Попробуйте позже.');
        return;
      }

      if (!isValidPassword) {
        await bot.sendMessage(chatId, '❌ Неверный пароль. Попробуйте еще раз или введите /start для начала.');
        return;
      }

      // Авторизация успешна
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
      
      const rightsName = user.rights_name;
      const rn = (rightsName || '').toLowerCase();
      const isPriv = rn === 'администратор' || rn === 'разработчик';
      const greeting = isPriv 
        ? '✅ Авторизация успешна! Вы вошли как администратор.' 
        : '✅ Авторизация успешна! Вы вошли как сотрудник.';

      try {
        await bot.sendMessage(chatId, greeting, getMainMenuKeyboard(rightsName));
      } catch (error) {
        // Если ошибка из-за Web App URL, отправляем сообщение без кнопки Web App
        if (error.message && error.message.includes('Only HTTPS links are allowed')) {
          logger.warn('Web App URL не поддерживается (требуется HTTPS). Отправляем меню без Web App кнопки.');
          const keyboard = getMainMenuKeyboard(rightsName);
          // Удаляем Web App кнопку и заменяем на обычную URL кнопку
          if (keyboard.reply_markup && keyboard.reply_markup.inline_keyboard) {
            const webAppButton = keyboard.reply_markup.inline_keyboard[0];
            if (webAppButton && webAppButton[0] && webAppButton[0].web_app) {
              const url = process.env.WEB_APP_URL || 'http://localhost:3000';
              webAppButton[0] = { text: '📱 Перейти в приложение (локально)', url: url };
            }
          }
          await bot.sendMessage(chatId, greeting, keyboard);
        } else {
          throw error;
        }
      }
      
    } else if (userState.state === 'adding_user_login') {
      setUserState(userId, 'adding_user_password', { login: text, user: userState.data.user });
      await bot.sendMessage(chatId, '🔐 Введите пароль для нового пользователя:', getCancelKeyboard());
      
    } else if (userState.state === 'adding_user_password') {
      const { login } = userState.data;
      setUserState(userId, 'adding_user_rights', { login, password: text, user: userState.data.user });
      
      const rights = await userService.getAllRights();
      const keyboard = {
        reply_markup: {
          inline_keyboard: rights.map(right => [
            { text: right.name === 'сотрудник' ? '👤 Сотрудник' : '👑 Администратор', callback_data: `rights_${right.id}` }
          ]).concat([[{ text: '❌ Отмена', callback_data: 'cancel' }]])
        }
      };
      
      await bot.sendMessage(chatId, '👤 Выберите права доступа для нового пользователя:', keyboard);
      
    } else if (userState.state === 'changing_password') {
      const { targetUserId, user } = userState.data;
      try {
        await userService.updateUserPassword(targetUserId, text);
        clearUserState(userId);
        setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
        await bot.sendMessage(chatId, '✅ Пароль успешно изменен.');
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(user.rights_name));
      } catch (e) {
        logger.error('changing_password', e);
        clearUserState(userId);
        setUserState(userId, 'authenticated', { user, auth_expires_at: Date.now() + 30 * 60 * 1000 });
        await bot.sendMessage(chatId, '❌ Ошибка при смене пароля.');
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(user.rights_name));
      }
    } else {
      // Неизвестное состояние, предлагаем начать заново
      await bot.sendMessage(chatId, 'Введите /start для начала работы.');
    }
  } catch (error) {
    logger.error('Error in handleMessage:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    clearUserState(userId);
  }
}

module.exports = {
  handleStart,
  handleMessage,
  setUserState,
  getUserState,
  clearUserState,
};
