import plugin from '../../../lib/plugins/plugin.js';
import { segment } from 'oicq';
import { formatRepo } from '../model/formatters/repo.js';
import { parseRepoUrl } from '../model/repoParser.js';
import { currentOrigin, providerFor, replyError, runtime } from './helper.js';

const LINK_REG = 'https?:\\/\\/[^\\s]+\\/[^\\s]+\\/[^\\s#?]+';

export class GitCardApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-链接卡片',
      event: 'message',
      priority: 500,
      rule: [{ reg: LINK_REG, fnc: 'resolveLink' }]
    });
  }

  async resolveLink(e) {
    const { config, store } = runtime();
    const origin = currentOrigin(e);
    if (!store.getLinkEnabled(origin, config.autoResolveLinks)) return true;

    const match = String(e.msg || '').match(new RegExp(LINK_REG));
    const ref = match ? parseRepoUrl(match[0], config) : null;
    if (!ref) return true;

    try {
      const provider = providerFor(ref, config);
      const cardUrl = provider.buildCardUrl(ref);
      if (cardUrl) {
        await e.reply(segment.image(cardUrl), true);
        return true;
      }
      const repo = await provider.getRepo(ref);
      await e.reply(formatRepo(repo), true);
    } catch (err) {
      await replyError(e, '解析仓库链接失败', err);
    }
    return true;
  }
}
