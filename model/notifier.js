import { segment } from '../../../lib/modules/oicq/index.js';

const parseOrigin = origin => {
  const str = String(origin);
  const parts = str.split(':');

  if (parts.length >= 3) {
    return {
      botId: parts[0],
      type: parts[1],
      id: parts.slice(2).join(':')
    };
  }

  if (parts.length === 2) {
    return {
      botId: '',
      type: parts[0],
      id: parts[1]
    };
  }

  throw new Error(`未知会话: ${origin}`);
};

const isQQBotTarget = botId => {
  if (!botId || !Bot?.[botId]) return false;
  const bot = Bot[botId];
  return bot.version?.id === 'QQBot' || bot.adapter?.id === 'QQBot' || bot.adapter?.name === 'QQBot';
};

const withQQBotButtons = (origin, message, buttonRows = []) => {
  if (!buttonRows.length || !isQQBotTarget(parseOrigin(origin).botId)) return message;
  const list = Array.isArray(message) ? [...message] : [message];
  return [...list, segment.button(...buttonRows)];
};

export const sendOriginMessage = async (origin, message) => {
  const { botId, type, id } = parseOrigin(origin);

  // Use specific adapter if bot_id is available
  const pickTarget = (picker) => {
    if (botId && Bot[botId]) {
      return Bot[botId][picker](id).sendMsg(message);
    }
    // Fallback: use Bot (tries all adapters)
    return Bot[picker](id).sendMsg(message);
  };

  if (type === 'group') return pickTarget('pickGroup');
  if (type === 'private') return pickTarget('pickFriend');
  throw new Error(`未知会话: ${origin}`);
};

export const notifySubscribers = async (subscribers, message, options = {}) => {
  for (const origin of [...new Set(subscribers || [])]) {
    try {
      await sendOriginMessage(origin, withQQBotButtons(origin, message, options.qqBotButtons || []));
    } catch (err) {
      logger.warn(`[Git-Plugin] 推送到 ${origin} 失败: ${err.message}`);
    }
  }
};
