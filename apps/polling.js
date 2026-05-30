import plugin from '../../../lib/plugins/plugin.js';
import { getGitConfig } from '../components/config.js';
import { startPollingService } from '../model/pollingService.js';
import { startWebhookService } from '../model/webhookServer.js';

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
  }
}
