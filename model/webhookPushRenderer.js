import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';
import { formatDate, shortText } from './formatters/common.js';
import { getPlatformLabel } from './platform.js';

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', icon: 'gitea.svg' }
};

export const renderWebhookPushCard = async push => {
  const style = PLATFORM_STYLES[push.platform] || PLATFORM_STYLES.github;
  try {
    return await puppeteer.screenshot('Git-Plugin/webhook-push-card', {
      tplFile: path.join(getPluginRoot(), 'resources', 'webhook-push-card.html'),
      saveId: `webhook-push-${push.platform}-${safeName(push.repo)}-${safeName(push.after)}`,
      imgType: 'png',
      quality: 100,
      push: {
        ...push,
        platformLabel: getPlatformLabel(push.platform),
        platformIconSvg: loadIcon(push.platform),
        accent: style.accent,
        accentSoft: style.accentSoft,
        title: shortText(push.title || 'Push 更新', 90),
        branch: push.branch || 'unknown',
        pusher: push.pusher || 'unknown',
        head: shortSha(push.after),
        time: formatDate(push.time),
        commits: push.commits.slice(0, 5).map(item => ({
          ...item,
          id: shortSha(item.id),
          message: shortText(firstLine(item.message), 96),
          author: item.author || 'unknown'
        })),
        hiddenCount: Math.max(0, push.commitCount - 5)
      }
    });
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染 Push 卡片失败: ${err?.message || err}`);
    return false;
  }
};

const loadIcon = platform => {
  const file = PLATFORM_STYLES[platform]?.icon || PLATFORM_STYLES.github.icon;
  try {
    return fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', file), 'utf8');
  } catch {
    return '';
  }
};

const firstLine = value => String(value || '').split('\n').find(Boolean) || '';
const shortSha = value => String(value || '').slice(0, 7);
const safeName = value => String(value || 'push').replace(/[^\w.-]+/g, '-').slice(0, 80);
