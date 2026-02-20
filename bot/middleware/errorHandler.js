const logger = require('../../utils/logger');
const { sendToChannel } = require('../../services/telegramService');

function isTransientNetworkError(error) {
  const code = (error && (error.code || (error.cause && error.cause.code))) || '';
  const msg = String((error && error.message) || '').toLowerCase();
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    msg.includes('getaddrinfo enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('timed out') ||
    msg.includes('network') ||
    msg.includes('dns')
  );
}

async function handleError(bot, error, context = {}) {
  try {
    logger.error('Bot error:', { 
      message: error.message, 
      stack: error.stack,
      context 
    });

    // Формируем сообщение об ошибке (ограничиваем длину для Telegram)
    const errorMessage = `❌ Ошибка в работе бота:\n\n` +
      `Ошибка: ${error.message}\n` +
      (error.stack ? `Stack: ${error.stack.substring(0, 1000)}\n` : '') +
      (Object.keys(context).length > 0 ? `Контекст: ${JSON.stringify(context).substring(0, 500)}` : '');

    // Отправляем в канал ошибок, если он настроен
    if (process.env.ERROR_CHANNEL_ID && !isTransientNetworkError(error)) {
      try {
        const { sendToChannel } = require('../../services/telegramService');
        await sendToChannel(process.env.ERROR_CHANNEL_ID, errorMessage);
      } catch (channelError) {
        logger.error('Error sending to error channel:', channelError);
      }
    }

    // Если есть chatId в контексте и бот доступен, отправляем пользователю простое сообщение
    if (context.chatId && bot) {
      try {
        await bot.sendMessage(context.chatId, '❌ Произошла ошибка. Администратор уведомлен.');
      } catch (userError) {
        logger.error('Error sending error message to user:', userError);
      }
    }
  } catch (handlerError) {
    logger.error('Error in error handler:', handlerError);
  }
}

module.exports = {
  handleError,
};
