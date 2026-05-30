import { createProvider } from './providers/index.js';
import { notifySubscribers } from './notifier.js';
import { RepoStore } from './repoStore.js';

let timer = null;
let running = false;

export const startPollingService = config => {
  if (timer || !config.pollingEnabled) return;
  const interval = Math.max(1, Number(config.checkIntervalMinutes || 30)) * 60 * 1000;
  timer = setInterval(() => runPolling(config).catch(err => {
    logger.error(`[Git-Plugin] 订阅轮询失败: ${err.stack || err.message}`);
  }), interval);
  runPolling(config).catch(err => logger.error(`[Git-Plugin] 首次订阅轮询失败: ${err.stack || err.message}`));
};

export const stopPollingService = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

export const runPolling = async config => {
  if (running) return;
  running = true;
  try {
    const store = new RepoStore();
    for (const item of store.listAllSubscriptions()) {
      await checkSubscription(config, store, item);
    }
  } finally {
    running = false;
  }
};

const checkSubscription = async (config, store, item) => {
  const lastCheck = store.getLastCheck(item.key);
  if (!lastCheck) {
    store.setLastCheck(item.key);
    return;
  }

  const provider = createProvider(item.ref.platform, config, item.ref);
  const [issues, pulls] = await Promise.all([
    provider.listIssues(item.ref, { perPage: 10 }).catch(err => {
      logger.warn(`[Git-Plugin] ${item.key} Issue 轮询失败: ${err.message}`);
      return [];
    }),
    provider.listPulls(item.ref, { perPage: 10 }).catch(err => {
      logger.warn(`[Git-Plugin] ${item.key} PR 轮询失败: ${err.message}`);
      return [];
    })
  ]);

  const lastTime = Date.parse(lastCheck);
  const updates = [
    ...issues.filter(issue => !issue.isPull).map(issue => ({ type: 'Issue', data: issue })),
    ...pulls.map(pull => ({ type: 'PR', data: pull }))
  ].filter(item => Date.parse(item.data.createdAt || item.data.updatedAt) > lastTime);

  store.setLastCheck(item.key);
  for (const update of updates.reverse()) {
    await notifySubscribers(item.subscribers, formatUpdate(item.key, update));
  }
};

const formatUpdate = (key, update) => {
  const data = update.data;
  return [
    `[Git 更新] ${key}`,
    `新增 ${update.type} #${data.number}`,
    `标题: ${data.title || '无标题'}`,
    `作者: ${data.author || '未知'}`,
    data.webUrl ? `链接: ${data.webUrl}` : ''
  ].filter(Boolean).join('\n');
};
