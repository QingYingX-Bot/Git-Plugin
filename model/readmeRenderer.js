import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getGitConfig, getPluginRoot } from '../components/config.js';
import { platformTitle } from './formatters/common.js';
import { cleanupTempFiles } from './readmeAssets.js';
import { renderReadmeMarkdown } from './readmeMarkdown.js';

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', icon: 'gitea.svg' }
};

export const renderReadmeCard = async readme => {
  const platform = readme.platform || 'github';
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github;
  const cleanupFiles = [];
  try {
    const html = await renderReadmeMarkdown(readme, cleanupFiles);
    const renderConfig = getReadmeRenderConfig();
    const data = {
      tplFile: path.join(getPluginRoot(), 'resources', 'readme-card.html'),
      saveId: `readme-${platform}-${safeName(readme.repo)}`,
      imgType: 'png',
      quality: 100,
      multiPageHeight: renderConfig.multiPageHeight,
      pageGotoParams: {
        timeout: renderConfig.pageGotoTimeoutMs,
        waitUntil: 'domcontentloaded'
      },
      readme: {
        platformLabel: platformTitle(platform),
        platformIconSvg: loadIcon(platform),
        accent: style.accent,
        accentSoft: style.accentSoft,
        repo: readme.repo || '未知仓库',
        name: readme.name || 'README.md',
        html
      }
    };
    return renderConfig.multiPage
      ? puppeteer.screenshots('Git-Plugin/readme-card', data)
      : puppeteer.screenshot('Git-Plugin/readme-card', data);
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染 README 图片失败: ${err?.message || err}`);
    return false;
  } finally {
    await cleanupTempFiles(cleanupFiles);
  }
};

const getReadmeRenderConfig = () => {
  try {
    const config = getGitConfig()?.readme || {};
    return {
      multiPage: Boolean(config.multiPage),
      multiPageHeight: Math.max(1200, Number(config.multiPageHeight || 3800)),
      pageGotoTimeoutMs: Math.max(60000, Number(config.pageGotoTimeoutMs || 180000))
    };
  } catch {
    return { multiPage: false, multiPageHeight: 3800, pageGotoTimeoutMs: 180000 };
  }
};

const loadIcon = platform => {
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github;
  try {
    return fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', style.icon), 'utf8');
  } catch {
    return '';
  }
};

const safeName = value => String(value || 'readme').replace(/[^\w.-]+/g, '-').slice(0, 80);
