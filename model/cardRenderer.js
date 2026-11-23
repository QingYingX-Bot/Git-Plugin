import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';
import { getPlatformLabel } from './platform.js';

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitcode.svg' },
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
    /**
     * 分支名给足长度（长分支如 oh-3.35.7-release 不该被砍成 oh-3.35.7-rel...），
     * 折行交给模板的省略号规则处理。
     */
    parentName: shorten(repo.parentName || '', 48),
    showFork: Boolean(repo.isFork && repo.parentName),
    /**
     * 官方镜像仓库（GitCode 加速计划 / Gitee 极速下载）：
     * 走 M2 胶囊样式，标题只显示仓库名，上方标出镜像来源。
     */
    isMirror: Boolean(repo.isMirror),
    mirrorLabel: repo.mirrorLabel || '',
    mirrorBadge: loadMirrorBadge(repo.mirrorBadge),
    mirrorOwner: repo.mirrorOwner || '',
    mirrorTitle: shorten(repo.mirrorShortName || repo.fullName || '', 28),
    showMirror: Boolean(repo.isMirror && repo.mirrorLabel),
    /**
     * Gitea 自建实例的同步镜像：没有平台角标图，改用「镜像」胶囊
     * 加一行上游地址（original_url 是 Gitea 独有的权威字段）。
     */
    showGiteaMirror: Boolean(repo.isMirror && repo.mirrorKind === 'gitea' && repo.mirrorUpstream),
    mirrorUpstream: cleanUpstream(repo.mirrorUpstream),
    mirrorSync: [formatInterval(repo.mirrorInterval), formatSyncTime(repo.mirrorLastSync)]
      .filter(Boolean)
      .join(' · '),
    updatedAt: formatDate(repo.updatedAt),
    stars: formatNumber(repo.stars),
    forks: formatNumber(repo.forks),
    openIssues: formatNumber(repo.openIssues)
  };
};

/**
 * 镜像徽标读成 data URI。
 *
 * 渲染模板会被写到 temp/html/ 下再截图，相对路径指向那里而不是插件目录，
 * 所以徽标必须内联成 data URI 才能稳定加载。
 */
const BADGE_CACHE = new Map();

/**
 * 把 Gitea 的 mirror_interval（Go duration，如 "8h0m0s"、"1h30m0s"）转成人话。
 * 解析失败就原样返回，不要把卡片弄崩。
 */
const formatInterval = value => {
  const text = String(value || '').trim();
  const m = text.match(/^(?:([\d.]+)h)?(?:([\d.]+)m)?(?:([\d.]+)s)?$/);
  if (!text || !m || (!m[1] && !m[2] && !m[3])) return text;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const parts = [];
  if (h) parts.push(`${h} 小时`);
  if (min) parts.push(`${min} 分钟`);
  if (!parts.length) parts.push(`${Number(m[3] || 0)} 秒`);
  return parts.join(' ');
};

/** 上游地址去掉协议和 .git 后缀，卡片上更短 */
const cleanUpstream = value => String(value || '')
  .replace(/^https?:\/\//i, '')
  .replace(/\.git$/i, '')
  .replace(/\/+$/, '');

/** 上次同步用相对时间：今天 09:31 / 昨天 18:20 / 3 天前 */
const formatSyncTime = value => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (diffDays <= 0) return `今天 ${hh}:${mm}`;
  if (diffDays === 1) return `昨天 ${hh}:${mm}`;
  if (diffDays < 30) return `${diffDays} 天前`;
  return formatDate(value);
};

const loadMirrorBadge = fileName => {
  if (!fileName) return '';
  if (BADGE_CACHE.has(fileName)) return BADGE_CACHE.get(fileName);
  let uri = '';
  try {
    const buf = fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', fileName));
    uri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    logger.warn(`[Git-Plugin] 读取镜像徽标失败: ${fileName}`);
  }
  BADGE_CACHE.set(fileName, uri);
  return uri;
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
