import plugin from '../../../lib/plugins/plugin.js';
import { segment } from 'oicq';
import { getGitConfig } from '../components/config.js';
import { formatRepo } from '../model/formatters/repo.js';
import { renderRepoCard, shouldUseOpenGraphCard } from '../model/cardRenderer.js';
import { parseRepoUrl } from '../model/repoParser.js';
import { currentOrigin, providerFor, replyError, runtime } from './helper.js';

const DISABLED_LINK_REG = '(?!)';
const FIXED_PLATFORM_HOSTS = ['github.com', 'gitee.com', 'gitcode.com'];

export class GitCardApp extends plugin {
  constructor() {
    const linkReg = buildLinkReg(getGitConfig());
    super({
      name: 'Git-Plugin-链接卡片',
      event: 'message',
      priority: 500,
      rule: [{ reg: new RegExp(linkReg, 'i'), fnc: 'resolveLink', log: false }]
    });
  }

  async resolveLink(e) {
    const { config, store } = runtime();
    const origin = currentOrigin(e);
    if (!store.getLinkEnabled(origin, config.autoResolveLinks)) return true;

    const match = String(e.msg || '').match(new RegExp(buildLinkReg(config), 'i'));
    const ref = match ? parseRepoUrl(match[0], config) : null;
    if (!ref) return true;

    try {
      const provider = providerFor(ref, config);
      if (shouldUseOpenGraphCard(ref, config)) {
        const cardUrl = provider.buildCardUrl(ref);
        await e.reply(segment.image(cardUrl), true);
        return true;
      }
      const repo = await provider.getRepo(ref);
      const img = await renderRepoCard(repo);
      await e.reply(img || withoutLink(formatRepo(repo)), true);
    } catch (err) {
      await replyError(e, '解析仓库链接失败', err);
    }
    return true;
  }
}

const withoutLink = text => String(text || '')
  .split('\n')
  .filter(line => !line.startsWith('链接: '))
  .join('\n');

const buildLinkReg = config => {
  if (config?.autoResolveLinks === false) return DISABLED_LINK_REG;
  const hosts = [...FIXED_PLATFORM_HOSTS, ...getGiteaHosts(config)];
  if (!hosts.length) return DISABLED_LINK_REG;
  return `https?:\\/\\/(?:${hosts.map(escapeRegExp).join('|')})\\/[^\\s\\/#?]+\\/[^\\s\\/#?]+(?:[\\/?#][^\\s]*)?`;
};

const getGiteaHosts = config => {
  const instances = config?.providers?.gitea?.instances || {};
  return Object.values(instances)
    .map(item => String(item?.baseUrl || '').trim())
    .map(value => {
      try {
        return new URL(value).host.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
};

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
