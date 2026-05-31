import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';
import { getPlatformLabel } from './platform.js';

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', icon: 'gitea.svg' }
};

const ICON_CACHE = new Map();

export const shouldUseOpenGraphCard = (ref, config = {}) => {
  const mode = String(config.card?.githubMode || 'opengraph').trim().toLowerCase();
  return ref.platform === 'github' && mode !== 'template';
};

export const renderRepoCard = async repo => {
  const data = {
    tplFile: path.join(getPluginRoot(), 'resources', 'repo-card.html'),
    saveId: `repo-card-${repo.platform}-${safeName(repo.fullName)}`,
    imgType: 'png',
    quality: 100,
    repo: toCardData(repo)
  };
  try {
    return await puppeteer.screenshot('Git-Plugin/repo-card', data);
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染仓库卡片失败: ${err?.message || err}`);
    return false;
  }
};

const toCardData = repo => {
  const style = PLATFORM_STYLES[repo.platform] || PLATFORM_STYLES.github;
  const platformIconSvg = loadPlatformIcon(repo.platform);
  return {
    ...repo,
    platformLabel: getPlatformLabel(repo.platform),
    accent: style.accent,
    accentSoft: style.accentSoft,
    platformIconSvg,
    fullName: repo.fullName || `${repo.owner}/${repo.repo}`,
    avatarUrl: repo.avatarUrl || '',
    description: shorten(repo.description || '暂无仓库描述', 88),
    defaultBranch: shorten(repo.defaultBranch || 'unknown', 18),
    updatedAt: formatDate(repo.updatedAt),
    stars: formatNumber(repo.stars),
    forks: formatNumber(repo.forks),
    openIssues: formatNumber(repo.openIssues)
  };
};

const loadPlatformIcon = platform => {
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github;
  if (ICON_CACHE.has(style.icon)) return ICON_CACHE.get(style.icon);
  const file = path.join(getPluginRoot(), 'resources', 'icons', style.icon);
  let svg = '';
  try {
    svg = fs.readFileSync(file, 'utf8');
  } catch {
    svg = '';
  }
  ICON_CACHE.set(style.icon, svg);
  return svg;
};

const safeName = value => String(value || 'repo').replace(/[^\w.-]+/g, '-').slice(0, 80);

const shorten = (value, limit) => {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
};

const formatNumber = value => {
  const num = Number(value) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
};

const formatDate = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleDateString('zh-CN');
};
