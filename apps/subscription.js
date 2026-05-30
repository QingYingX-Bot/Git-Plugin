import plugin from '../../../lib/plugins/plugin.js';
import { formatSubscriptionList } from '../model/formatters/repo.js';
import { parseRepoTarget, stripCommand } from '../model/repoParser.js';
import { commandPlatform, currentOrigin, providerFor, replyError, runtime } from './helper.js';

const SUB_COMMANDS = ['githubsub', 'gitcodesub', 'giteesub', 'giteasub', 'gitsub'];
const UNSUB_COMMANDS = ['githubunsub', 'gitcodeunsub', 'giteeunsub', 'giteaunsub', 'gitunsub'];

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
    const ref = parseRepoTarget(body, { config, defaultPlatform: platform });
    if (!ref) return e.reply('请输入仓库，例如 #gitsub github owner/repo', true);

    try {
      const provider = providerFor(ref, config);
      const repo = await provider.getRepo(ref);
      store.addSubscription(currentOrigin(e), ref, repo);
      store.setDefault(currentOrigin(e), ref);
      return e.reply(`已订阅 ${repo.platform}:${repo.fullName}`, true);
    } catch (err) {
      return replyError(e, '订阅仓库失败', err);
    }
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
