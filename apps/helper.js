import { getGitConfig } from '../components/config.js';
import { formatError } from '../model/formatters/common.js';
import { normalizePlatform } from '../model/platform.js';
import { createProvider } from '../model/providers/index.js';
import { getOriginId } from '../model/repoParser.js';
import { RepoStore } from '../model/repoStore.js';

export const runtime = () => {
  const config = getGitConfig();
  const store = new RepoStore();
  return { config, store };
};

export const providerFor = (ref, config) => createProvider(ref.platform, config, ref);

export const replyError = (e, prefix, err) => {
  logger.error(`[Git-Plugin] ${prefix}: ${err.stack || err.message || err}`);
  return e.reply(`${prefix}\n${formatError(err)}`, true);
};

export const findDefaultRef = (store, origin, platform = '') => {
  const defaultRef = store.getDefault(origin, platform);
  if (defaultRef) return defaultRef;
  const subscriptions = store.listSubscriptions(origin)
    .map(item => item.ref)
    .filter(ref => !platform || ref.platform === platform);
  return subscriptions.length === 1 ? subscriptions[0] : null;
};

export const currentOrigin = e => getOriginId(e);

export const commandPlatform = (message, fallback = '') => {
  const text = String(message || '').replace(/^\s*[#/!！]?/, '').toLowerCase();
  if (text.startsWith('github')) return 'github';
  if (text.startsWith('gitee')) return 'gitee';
  if (text.startsWith('gitcode')) return 'gitcode';
  if (text.startsWith('gitea')) return 'gitea';
  const bodyPlatform = normalizePlatform(text.split(/\s+/).filter(Boolean)[1]);
  return bodyPlatform || fallback;
};
