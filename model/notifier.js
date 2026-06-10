export const sendOriginMessage = async (origin, message) => {
  const str = String(origin);
  const parts = str.split(':');

  // Parse origin format: "bot_id:type:id" or "type:id"
  // bot_id is optional, type is "group" or "private"
  let botId = '';
  let type = '';
  let id = '';

  if (parts.length >= 3) {
    // "bot_id:type:id" format (new format with bot_id)
    botId = parts[0];
    type = parts[1];
    id = parts.slice(2).join(':');
  } else if (parts.length === 2) {
    // "type:id" format (old format without bot_id)
    type = parts[0];
    id = parts[1];
  } else {
    throw new Error(`未知会话: ${origin}`);
  }

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

export const notifySubscribers = async (subscribers, message) => {
  for (const origin of subscribers || []) {
    try {
      await sendOriginMessage(origin, message);
    } catch (err) {
      logger.warn(`[Git-Plugin] 推送到 ${origin} 失败: ${err.message}`);
    }
  }
};
