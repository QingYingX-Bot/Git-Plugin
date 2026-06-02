import plugin from '../../../lib/plugins/plugin.js';
import { formatError } from '../model/formatters/common.js';
import { formatSubscriptionList } from '../model/formatters/repo.js';
import { parseRepoTarget, stripCommand } from '../model/repoParser.js';
import { commandPlatform, currentOrigin, providerFor, replyError, runtime } from './helper.js';

const SUB_COMMANDS = ['githubsub', 'gitcodesub', 'giteesub', 'giteasub', 'gitsub'];
const UNSUB_COMMANDS = ['githubunsub', 'gitcodeunsub', 'giteeunsub', 'giteaunsub', 'gitunsub'];
const TARGET_SEPARATOR_REG = /[,，、]+/;
const PLATFORM_PREFIX_REG = /^(github|gitee|gitcode|gitea)\b/i;

export class GitSubscriptionApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-订阅',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^[#/!！]?(githubsub|gitcodesub|giteesub|giteasub|gitsub)\\b', fnc: 'subscribe' },
        { reg: '^[#/!！]?(githubunsub|gitcodeunsub|giteeunsub|giteaunsub|gitunsub)\\b', fnc: 'unsubscribe' },
        { reg: '^[#/!！]?gitlist(?:\\s+(github|gitee|gitcode|gitea))?$', fnc: 'list' }
      ]
    });
  }

  async subscribe(e) {
    const { config, store } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const body = stripCommand(e.msg, SUB_COMMANDS);
    const targets = parseSubscriptionTargets(body, { config, defaultPlatform: platform });
    if (targets.length > 1) return this.subscribeMany(e, targets, config, store);

    const ref = targets.length === 1 ? targets[0].ref : null;
    if (!ref) return e.reply('请输入仓库，例如 #gitsub github owner/repo', true);

    try {
      const repo = await this.subscribeRef(currentOrigin(e), ref, config, store);
      return e.reply(`已订阅 ${repo.platform}:${repo.fullName}`, true);
    } catch (err) {
      return replyError(e, '订阅仓库失败', err);
    }
  }

  async subscribeMany(e, targets, config, store) {
    const origin = currentOrigin(e);
    const success = [];
    const failed = [];

    for (const target of targets) {
      if (!target.ref) {
        failed.push(`${target.raw}: 仓库格式错误`);
        continue;
      }

      try {
        const repo = await this.subscribeRef(origin, target.ref, config, store);
        success.push(`${repo.platform}:${repo.fullName}`);
      } catch (err) {
        failed.push(`${formatTarget(target)}: ${formatError(err)}`);
      }
    }

    return e.reply(formatSubscribeResult(success, failed), true);
  }

  async subscribeRef(origin, ref, config, store) {
    const provider = providerFor(ref, config);
    const repo = await provider.getRepo(ref);
    store.addSubscription(origin, ref, repo);
    store.setDefault(origin, ref);
    return repo;
  }

  async unsubscribe(e) {
    const { config, store } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const body = stripCommand(e.msg, UNSUB_COMMANDS);
    const origin = currentOrigin(e);
    if (!body) {
      const removed = store.removeAllSubscriptions(origin, platform);
      return e.reply(removed.length ? `已取消订阅:\n${removed.join('\n')}` : '当前会话没有订阅仓库', true);
    }
    const ref = parseRepoTarget(body, { config, defaultPlatform: platform });
    if (!ref) return e.reply('请输入仓库，例如 #gitunsub github owner/repo', true);
    const ok = store.removeSubscription(origin, ref);
    return e.reply(ok ? `已取消订阅 ${ref.platform}:${ref.fullName}` : '当前会话没有订阅该仓库', true);
  }

  async list(e) {
    const { store } = runtime();
    const platform = commandPlatform(e.msg, '');
    return e.reply(formatSubscriptionList(store.listSubscriptions(currentOrigin(e), platform)), true);
  }
}

const parseSubscriptionTargets = (body, options = {}) => {
  const parts = String(body || '').split(TARGET_SEPARATOR_REG).map(item => item.trim()).filter(Boolean);
  let giteaInstance = '';
  return parts.map(raw => {
    const input = withCurrentGiteaInstance(raw, giteaInstance, options.defaultPlatform);
    const ref = parseRepoTarget(input, options);
    if (ref?.platform === 'gitea' && ref.instance) giteaInstance = ref.instance;
    return { raw, ref };
  });
};

const withCurrentGiteaInstance = (raw, instance, defaultPlatform) => {
  const text = String(raw || '').trim();
  if (!instance || hasUrl(text) || startsWithOtherPlatform(text)) return text;
  if (defaultPlatform !== 'gitea' && !/^gitea\b/i.test(text)) return text;
  return `${instance} ${text.replace(/^gitea\b/i, '').trim()}`;
};

const hasUrl = text => /(^|\s)https?:\/\//i.test(text);

const startsWithOtherPlatform = text => PLATFORM_PREFIX_REG.test(text) && !/^gitea\b/i.test(text);

const formatTarget = target => {
  const ref = target.ref;
  return ref ? `${ref.platform}:${ref.fullName}` : target.raw;
};

const formatSubscribeResult = (success, failed) => {
  const lines = ['订阅完成'];
  if (success.length) {
    lines.push(`成功 ${success.length} 个:`);
    lines.push(...success.map(item => `- ${item}`));
  }
  if (failed.length) {
    lines.push(`失败 ${failed.length} 个:`);
    lines.push(...failed.flatMap(item => formatResultLine(item)));
  }
  return lines.join('\n');
};

const formatResultLine = value => String(value || '').split('\n').map((line, index) => {
  return index === 0 ? `- ${line}` : `  ${line}`;
});
