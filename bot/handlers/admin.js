const userService = require('../../services/userService');
const { getMainMenuKeyboard, getCancelKeyboard, getUserManagementKeyboard, getUsersListKeyboard, getUserActionsKeyboard, getDeleteConfirmKeyboard, getRightsChangeKeyboard } = require('../keyboards');
const { getUserState, setUserState, clearUserState } = require('./auth');
const logger = require('../../utils/logger');
const { sendToChannel } = require('../../services/telegramService');
function isPrivileged(rightsName) { const s = String(rightsName || '').toLowerCase(); return s === 'администратор' || s === 'разработчик'; }

async function handleAddUser(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }

    setUserState(userId, 'adding_user_login', { user: userState.data.user });
    await bot.sendMessage(chatId, '👤 Введите логин для нового пользователя:', getCancelKeyboard());
  } catch (error) {
    logger.error('Error in handleAddUser:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleManageUsers(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, 'Выберите функцию управления пользователями:', getUserManagementKeyboard());
  } catch (error) {
    logger.error('handleManageUsers', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleManageUsersEdit(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    const users = await userService.listAllUsers();
    if (!users.length) {
      await bot.sendMessage(chatId, 'Пользователи отсутствуют.', getUserManagementKeyboard());
      return;
    }
    await bot.sendMessage(chatId, 'Выберите пользователя:', getUsersListKeyboard(users));
  } catch (error) {
    logger.error('handleManageUsersEdit', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleManageUserSelect(bot, msg, userIdToEdit) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, 'Выберите действие:', getUserActionsKeyboard(parseInt(userIdToEdit, 10)));
  } catch (error) {
    logger.error('handleManageUserSelect', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleChangePasswordStart(bot, msg, targetUserId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    setUserState(userId, 'changing_password', { targetUserId: parseInt(targetUserId, 10), user: st.data.user });
    await bot.sendMessage(chatId, 'Введите новый пароль для пользователя:', getCancelKeyboard());
  } catch (error) {
    logger.error('handleChangePasswordStart', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleDeleteUserPrompt(bot, msg, targetUserId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, 'Подтвердите удаление пользователя:', getDeleteConfirmKeyboard(parseInt(targetUserId, 10)));
  } catch (error) {
    logger.error('handleDeleteUserPrompt', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleDeleteUserConfirm(bot, msg, targetUserId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await userService.deleteUser(parseInt(targetUserId, 10));
    await bot.sendMessage(chatId, '✅ Пользователь удален.');
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
  } catch (error) {
    logger.error('handleDeleteUserConfirm', error);
    await bot.sendMessage(chatId, '❌ Ошибка при удалении пользователя.');
    try {
      const st2 = getUserState(userId);
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st2.data.user.rights_name));
    } catch (_) {}
  }
}

async function handleDeleteUserCancel(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated') {
      await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
      return;
    }
    await bot.sendMessage(chatId, 'Операция отменена.');
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
  } catch (error) {
    logger.error('handleDeleteUserCancel', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleChangeUserRightsStart(bot, msg, targetUserId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, 'Выберите права доступа:', getRightsChangeKeyboard(parseInt(targetUserId, 10)));
  } catch (error) {
    logger.error('handleChangeUserRightsStart', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleChangeUserRightsCommit(bot, msg, targetUserId, roleKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const st = getUserState(userId);
    if (st.state !== 'authenticated' || !isPrivileged(st.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    let roleName = null;
    if (roleKey === 'employee') roleName = 'сотрудник';
    if (roleKey === 'admin') roleName = 'администратор';
    if (!roleName) {
      await bot.sendMessage(chatId, '❌ Неверный выбор.');
      return;
    }
    const rightsId = await userService.findRightsIdByName(roleName);
    if (!rightsId) {
      await bot.sendMessage(chatId, '❌ Права доступа не найдены.');
      return;
    }
    await userService.updateUserRights(parseInt(targetUserId, 10), rightsId);
    await bot.sendMessage(chatId, '✅ Права доступа обновлены.');
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
  } catch (error) {
    logger.error('handleChangeUserRightsCommit', error);
    await bot.sendMessage(chatId, '❌ Ошибка при изменении прав доступа.');
    try {
      const st2 = getUserState(userId);
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st2.data.user.rights_name));
    } catch (_) {}
  }
}

async function handleRightsSelection(bot, msg, rightsId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state !== 'adding_user_rights') {
      await bot.sendMessage(chatId, '❌ Неверное состояние. Введите /start для начала.');
      return;
    }

    const { login, password } = userState.data;

    // Создаем пользователя
    const newUser = await userService.createUser(login, password, parseInt(rightsId));

    clearUserState(userId);
    setUserState(userId, 'authenticated', { user: userState.data.user });

    await bot.sendMessage(chatId, `✅ Пользователь "${login}" успешно создан!`, getMainMenuKeyboard(userState.data.user.rights_name));
  } catch (error) {
    logger.error('Error in handleRightsSelection:', error);
    
    // Проверяем, не дубликат ли это
    if (error.code === '23505') { // PostgreSQL unique violation
      await bot.sendMessage(chatId, '❌ Пользователь с таким логином уже существует.');
    } else {
      await bot.sendMessage(chatId, '❌ Произошла ошибка при создании пользователя. Попробуйте позже.');
    }
    
    const userState = getUserState(userId);
    if (userState.state === 'adding_user_rights') {
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user: userState.data.user });
    }
  }
}

async function handleCreateReport(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }

    const { getReportTypeKeyboard } = require('../keyboards');
    await bot.sendMessage(chatId, '📊 Выберите тип отчета:', getReportTypeKeyboard());
  } catch (error) {
    logger.error('Error in handleCreateReport:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleReportTypeSelection(bot, msg, typeKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const userState = getUserState(userId);
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    const reportService = require('../../services/reportService');
    const addresses = await reportService.listAddresses();
    const isDev = String(userState.data.user.rights_name || '').toLowerCase() === 'разработчик';
    const filtered = isDev ? addresses : addresses.filter(a => String(a.name || '') !== 'Тестовый магазин');
    const { getAddressKeyboardForReport } = require('../keyboards');
    await bot.sendMessage(chatId, '🏪 Выберите адрес:', getAddressKeyboardForReport(typeKey, filtered));
  } catch (error) {
    logger.error('handleReportTypeSelection', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleReportAddressSelection(bot, msg, addressIdStr, typeKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const userState = getUserState(userId);
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    const addressId = parseInt(addressIdStr, 10);
    if (typeKey === 'report_type_replenish') {
      const { getLastMonthsForAddressKeyboard } = require('../keyboards');
      await bot.sendMessage(chatId, '📅 Выберите месяц:', getLastMonthsForAddressKeyboard(5, addressId));
    } else if (typeKey === 'report_type_stock') {
      const reportService = require('../../services/reportService');
      const dates = await reportService.listRecountDatesLast3MonthsByAddress(addressId);
      const { getRecountDatesForAddressKeyboard } = require('../keyboards');
      await bot.sendMessage(chatId, '📅 Выберите дату пересчета:', getRecountDatesForAddressKeyboard(dates, addressId));
    }
  } catch (error) {
    logger.error('handleReportAddressSelection', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

async function handleMonthSelection(bot, msg, monthKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }

    // Отправляем сообщение о начале генерации
    await bot.sendMessage(chatId, '⏳ Начинаю генерацию отчета. Пожалуйста, подождите...');

    try {
      const reportService = require('../../services/reportService');
      const filePath = await reportService.generateReplenishReportByMonth(monthKey);
      
      // Отправляем файл пользователю
      await bot.sendDocument(chatId, filePath, { 
        caption: `📊 Отчет за ${monthKey}` 
      });

      // Удаляем временный файл после отправки
      const fs = require('fs');
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          logger.error('Error deleting temp file:', err);
        }
      }, 60000); // Удаляем через минуту
      const rightsName = userState.data.user.rights_name;
      await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
      
    } catch (reportError) {
      logger.error('Error generating report:', reportError);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при генерации отчета. Попробуйте позже.');
      throw reportError;
    }
    
  } catch (error) {
    logger.error('Error in handleMonthSelection:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при генерации отчета. Попробуйте позже.');
    
    // Отправляем ошибку в канал ошибок
    try {
      await sendToChannel(process.env.ERROR_CHANNEL_ID, `❌ Ошибка генерации отчета:\n\n${error.message}\n\nUser ID: ${userId}\nMonth: ${monthKey}`);
    } catch (err) {
      logger.error('Error sending error to channel:', err);
    }
    try {
      const st = getUserState(userId);
      if (st && st.data && st.data.user) {
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
      }
    } catch (_) {}
  }
}

async function handleReplenishMonthSelection(bot, msg, addressIdStr, monthKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const userState = getUserState(userId);
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, '⏳ Генерация отчета по привозам. Пожалуйста, подождите...');
    const reportService = require('../../services/reportService');
    const addressId = parseInt(addressIdStr, 10);
    const filePath = await reportService.generateReplenishReportByMonthForAddress(addressId, monthKey);
    await bot.sendDocument(chatId, filePath, { caption: `📊 Привозы за ${monthKey}` });
    const fs = require('fs');
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        logger.error('Error deleting temp file:', err);
      }
    }, 60000);
    const rightsName = userState.data.user.rights_name;
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
  } catch (error) {
    logger.error('handleReplenishMonthSelection', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при генерации отчета. Попробуйте позже.');
    try {
      const st = getUserState(userId);
      if (st && st.data && st.data.user) {
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
      }
    } catch (_) {}
  }
}

async function handleRecountDateSelection(bot, msg, dateKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const userState = getUserState(userId);
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, '⏳ Генерация отчета. Пожалуйста, подождите...');
    const reportService = require('../../services/reportService');
    const filePath = await reportService.generateRecountReportByDate(dateKey);
    await bot.sendDocument(chatId, filePath, { caption: `📊 Пересчет на ${dateKey}` });
    const fs = require('fs');
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        logger.error('Error deleting temp file:', err);
      }
    }, 60000);
    const rightsName = userState.data.user.rights_name;
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
  } catch (error) {
    logger.error('handleRecountDateSelection', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при генерации отчета. Попробуйте позже.');
    try {
      const st = getUserState(userId);
      if (st && st.data && st.data.user) {
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
      }
    } catch (_) {}
  }
}

async function handleRecountDateSelectionByAddress(bot, msg, addressIdStr, dateKey) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const userState = getUserState(userId);
    if (userState.state !== 'authenticated' || !isPrivileged(userState.data.user.rights_name)) {
      await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этого действия.');
      return;
    }
    await bot.sendMessage(chatId, '⏳ Генерация отчета по пересчету. Пожалуйста, подождите...');
    const reportService = require('../../services/reportService');
    const addressId = parseInt(addressIdStr, 10);
    const filePath = await reportService.generateRecountReportByDateForAddress(addressId, dateKey);
    await bot.sendDocument(chatId, filePath, { caption: `📊 Пересчет на ${dateKey}` });
    const fs = require('fs');
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        logger.error('Error deleting temp file:', err);
      }
    }, 60000);
    const rightsName = userState.data.user.rights_name;
    await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(rightsName));
  } catch (error) {
    logger.error('handleRecountDateSelectionByAddress', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при генерации отчета. Попробуйте позже.');
    try {
      const st = getUserState(userId);
      if (st && st.data && st.data.user) {
        await bot.sendMessage(chatId, '📋 Главное меню:', getMainMenuKeyboard(st.data.user.rights_name));
      }
    } catch (_) {}
  }
}

async function handleCancel(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const userState = getUserState(userId);
    
    if (userState.state === 'authenticated') {
      clearUserState(userId);
      setUserState(userId, 'authenticated', { user: userState.data.user });
      await bot.sendMessage(chatId, '❌ Действие отменено.', getMainMenuKeyboard(userState.data.user.rights_name));
    } else {
      clearUserState(userId);
      await bot.sendMessage(chatId, '❌ Действие отменено. Введите /start для начала работы.');
    }
  } catch (error) {
    logger.error('Error in handleCancel:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = {
  handleAddUser,
  handleRightsSelection,
  handleCreateReport,
  handleMonthSelection,
  handleReportTypeSelection,
  handleReportAddressSelection,
  handleReplenishMonthSelection,
  handleRecountDateSelection,
  handleRecountDateSelectionByAddress,
  handleCancel,
  handleManageUsers,
  handleManageUsersEdit,
  handleManageUserSelect,
  handleChangePasswordStart,
  handleDeleteUserPrompt,
  handleDeleteUserConfirm,
  handleDeleteUserCancel,
  handleChangeUserRightsStart,
  handleChangeUserRightsCommit,
};
