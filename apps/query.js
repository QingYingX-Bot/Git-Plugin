import plugin from '../../../lib/plugins/plugin.js';
import { formatIssue } from '../model/formatters/issue.js';
import { formatNumberList } from '../model/formatters/numberList.js';
import { formatPull } from '../model/formatters/pull.js';
import { formatRateLimit } from '../model/formatters/rateLimit.js';
import { formatReadme } from '../model/formatters/readme.js';
import { formatRepo } from '../model/formatters/repo.js';
import { parseNumberTarget, parseRepoTarget, stripCommand } from '../model/repoParser.js';
import { commandPlatform, currentOrigin, findDefaultRef, providerFor, replyError, runtime } from './helper.js';

const REPO_COMMANDS = ['githubrepo', 'gitcoderepo', 'giteerepo', 'gitearepo', 'gitrepo'];
const ISSUE_COMMANDS = ['githubissue', 'gitcodeissue', 'giteeissue', 'giteaissue', 'gitissue'];
const PR_COMMANDS = ['githubpr', 'gitcodepr', 'giteepr', 'giteapr', 'gitpr'];
const README_COMMANDS = ['githubreadme', 'gitcodereadme', 'giteereadme', 'giteareadme', 'gitreadme'];
const LIMIT_COMMANDS = ['githublimit', 'gitcodelimit', 'giteelimit', 'gitealimit', 'gitlimit'];

export class GitQueryApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-查询',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^[#/!！]?(githubrepo|gitcoderepo|giteerepo|gitearepo|gitrepo)\\b', fnc: 'repo' },
        { reg: '^[#/!！]?(githubissue|gitcodeissue|giteeissue|giteaissue|gitissue)\\b', fnc: 'issue' },
        { reg: '^[#/!！]?(githubpr|gitcodepr|giteepr|giteapr|gitpr)\\b', fnc: 'pull' },
        { reg: '^[#/!！]?(githubreadme|gitcodereadme|giteereadme|giteareadme|gitreadme)\\b', fnc: 'readme' },
        { reg: '^[#/!！]?(githublimit|gitcodelimit|giteelimit|gitealimit|gitlimit)$', fnc: 'rateLimit' }
      ]
    });
  }

  async repo(e) {
    const { config } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const body = stripCommand(e.msg, REPO_COMMANDS);
    const ref = parseRepoTarget(body, { config, defaultPlatform: platform });
    if (!ref) return e.reply('请输入仓库，例如 #gitrepo github owner/repo', true);
    try {
      const repo = await providerFor(ref, config).getRepo(ref);
      return e.reply(formatRepo(repo), true);
    } catch (err) {
      return replyError(e, '查询仓库失败', err);
    }
  }

  async issue(e) {
    return this.numberQuery(e, ISSUE_COMMANDS, 'Issue', async (provider, ref, number) => {
      return formatIssue(await provider.getIssue(ref, number));
    }, async (provider, ref) => {
      const result = await this.collectOpenItems(provider, 'listIssues', ref, item => !item.isPull);
      return formatNumberList(ref, 'Issue', result.items, result);
    });
  }

  async pull(e) {
    return this.numberQuery(e, PR_COMMANDS, 'PR', async (provider, ref, number) => {
      try {
        return formatPull(await provider.getPull(ref, number));
      } catch (err) {
        if (err?.status === 404) return this.formatPullNotFound(provider, ref, number);
        throw err;
      }
    }, async (provider, ref) => {
      const result = await this.collectOpenItems(provider, 'listPulls', ref);
      return formatNumberList(ref, 'PR', result.items, result);
    });
  }

  async readme(e) {
    const { config, store } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const body = stripCommand(e.msg, README_COMMANDS);
    const defaultRef = findDefaultRef(store, currentOrigin(e), platform);
    const ref = parseRepoTarget(body, { config, defaultPlatform: platform }) || defaultRef;
    if (!ref) return e.reply('请输入仓库，例如 #gitreadme github owner/repo', true);
    try {
      const readme = await providerFor(ref, config).getReadme(ref);
      return e.reply(formatReadme(readme), true);
    } catch (err) {
      return replyError(e, '查询 README 失败', err);
    }
  }

  async rateLimit(e) {
    const { config } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const ref = { platform, instance: '', owner: '', repo: '', fullName: '' };
    try {
      const info = await providerFor(ref, config).getRateLimit();
      return e.reply(formatRateLimit(info), true);
    } catch (err) {
      return replyError(e, '查询限流失败', err);
    }
  }

  async numberQuery(e, commands, label, handler, listHandler) {
    const body = stripCommand(e.msg, commands);
    const { config, store } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const defaultRef = findDefaultRef(store, currentOrigin(e), platform);
    const target = parseNumberTarget(body, {
      config,
      defaultPlatform: platform,
      defaultRef
    });
    if (!target) {
      const ref = parseRepoTarget(body, { config, defaultPlatform: platform }) || (!body ? defaultRef : null);
      if (ref && listHandler) {
        try {
          return e.reply(await listHandler(providerFor(ref, config), ref), true);
        } catch (err) {
          return replyError(e, `查询 ${label} 列表失败`, err);
        }
      }
      return e.reply(`请输入 ${label} 引用，例如 #git${label.toLowerCase()} github owner/repo#1`, true);
    }
    try {
      const provider = providerFor(target.ref, config);
      return e.reply(await handler(provider, target.ref, target.number), true);
    } catch (err) {
      return replyError(e, `查询 ${label} 失败`, err);
    }
  }

  async collectOpenItems(provider, method, ref, filter = () => true) {
    const perPage = 100;
    const maxPages = 10;
    const items = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const pageItems = await provider[method](ref, { state: 'open', perPage, page });
      const list = Array.isArray(pageItems) ? pageItems : [];
      items.push(...list.filter(filter));
      if (list.length < perPage) return { items, truncated: false };
    }
    return { items, truncated: true };
  }

  async formatPullNotFound(provider, ref, number) {
    const lines = [
      `未找到 PR #${number}`,
      `仓库: ${ref.fullName}`,
      '请确认编号是 Pull request 编号、仓库路径正确、私有仓库 token 已授权该仓库。'
    ];
    try {
      const issue = await provider.getIssue(ref, number);
      if (issue && !issue.isPull) {
        lines.splice(2, 1, `这个编号对应 Issue: ${issue.title || '无标题'}`);
        lines.push(`Issue 查询: #${ref.platform}issue ${ref.fullName}#${number}`);
        if (issue.webUrl) lines.push(`链接: ${issue.webUrl}`);
      }
    } catch {
      // Keep the generic 404 hint when the issue endpoint is unavailable too.
    }
    return lines.join('\n');
  }
}
