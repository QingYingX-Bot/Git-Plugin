import plugin from '../../../lib/plugins/plugin.js';
import { getGitConfig } from '../components/config.js';
import { startPollingService } from '../model/pollingService.js';
import { startWebhookService } from '../model/webhookServer.js';
import { runRepoUpdateCheck } from '../model/repoUpdateService.js';

export class GitPollingApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-订阅轮询',
      event: 'message',
      priority: 1000,
      rule: []
    });
    const config = getGitConfig();
    startPollingService(config);
    startWebhookService(config);

    // Set up repo update cron if enabled
    if (config.repoUpdate?.enabled) {
      const cron = config.repoUpdate.cron || '0 */30 * * * *'
      this.task = {
        name: 'Git-Plugin-仓库更新检测',
        cron,
        fnc: () => this.checkRepoUpdate()
      }
    }
  }

  async checkRepoUpdate() {
    const config = getGitConfig()
    await runRepoUpdateCheck(config)
  }
}
