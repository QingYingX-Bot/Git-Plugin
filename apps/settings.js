import plugin from '../../../lib/plugins/plugin.js';
import { parseRepoTarget, stripCommand } from '../model/repoParser.js';
import { commandPlatform, currentOrigin, providerFor, replyError, runtime } from './helper.js';

const DEFAULT_COMMANDS = ['githubdefault', 'gitcodedefault', 'giteedefault', 'giteadefault', 'gitdefault'];
const LINK_COMMANDS = ['gitlink'];

export class GitSettingsApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-设置',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^[#/!！]?(githubdefault|gitcodedefault|giteedefault|giteadefault|gitdefault)\\b', fnc: 'setDefault' },
        { reg: '^[#/!！]?gitlink\\b', fnc: 'setLink' }
      ]
    });
  }

  async setDefault(e) {
    const { config, store } = runtime();
    const platform = commandPlatform(e.msg, config.defaultPlatform);
    const body = stripCommand(e.msg, DEFAULT_COMMANDS);
    const origin = currentOrigin(e);
    if (!body) {
      const ref = store.getDefault(origin, platform);
      const text = ref ? `当前默认仓库: ${ref.platform}:${ref.fullName}` : '当前会话没有默认仓库';
      return e.reply(text, true);
    }

    const ref = parseRepoTarget(body, { config, defaultPlatform: platform });
    if (!ref) return e.reply('请输入仓库，例如 #gitdefault github owner/repo', true);
    try {
      const repo = await providerFor(ref, config).getRepo(ref);
      store.setDefault(origin, ref);
      return e.reply(`已设置默认仓库: ${repo.platform}:${repo.fullName}`, true);
    } catch (err) {
      return replyError(e, '设置默认仓库失败', err);
    }
  }

  async setLink(e) {
    const body = stripCommand(e.msg, LINK_COMMANDS).toLowerCase();
    const { store } = runtime();
    if (!['on', 'off'].includes(body)) return e.reply('参数使用 on 或 off', true);
    const enabled = body === 'on';
    store.setLinkEnabled(currentOrigin(e), enabled);
    return e.reply(`当前会话已${enabled ? '开启' : '关闭'} Git 链接自动解析`, true);
  }
}
