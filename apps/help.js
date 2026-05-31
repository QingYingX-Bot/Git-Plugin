import plugin from '../../../lib/plugins/plugin.js';
import { formatGitHelpText, renderGitHelp } from '../model/helpRenderer.js';

export class GitHelpApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-帮助',
      event: 'message',
      priority: 500,
      rule: [{ reg: '^[#/!！]?(gt帮助|gthelp|git帮助|githelp)$', fnc: 'help' }]
    });
  }

  async help(e) {
    try {
      const img = await renderGitHelp();
      return e.reply(img || formatGitHelpText(), true);
    } catch (err) {
      logger.error(`[Git-Plugin] 渲染帮助失败: ${err?.message || err}`);
      return e.reply(formatGitHelpText(), true);
    }
  }
}
