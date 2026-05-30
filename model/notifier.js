export const sendOriginMessage = async (origin, message) => {
  const [type, id] = String(origin).split(':');
  if (type === 'group') return Bot.pickGroup(id).sendMsg(message);
  if (type === 'private') return Bot.pickFriend(id).sendMsg(message);
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
