import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';
import { formatDate, platformTitle, shortText } from './formatters/common.js';
import { compactNumberRanges } from './formatters/numberList.js';
import { cleanupTempFiles, localizeImageUrl, toFileUrl } from './renderAssets.js';

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', icon: 'gitea.svg' }
};

const STATUS_STYLES = {
  open: { label: 'Open', color: '#1a7f37', soft: 'rgba(26, 127, 55, 0.14)' },
  closed: { label: 'Closed', color: '#cf222e', soft: 'rgba(207, 34, 46, 0.14)' },
  merged: { label: 'Merged', color: '#8250df', soft: 'rgba(130, 80, 223, 0.14)' }
};

export const renderIssueCard = issue => {
  return renderCard('issue', {
    mode: 'detail',
    kind: issue.isPull ? 'Issue / PR' : 'Issue',
    item: toIssueData(issue)
  });
};

export const renderPullCard = pull => {
  return renderCard('pull', {
    mode: 'detail',
    kind: 'Pull Request',
    item: toPullData(pull)
  });
};

export const renderNumberListCard = (ref, label, items = [], options = {}) => {
  const ranges = compactNumberRanges(items.map(item => item.number));
  return renderCard(`${label.toLowerCase()}-list`, {
    mode: 'list',
    kind: label,
    item: {
      platform: ref.platform,
      repo: ref.fullName,
      title: `${platformTitle(ref.platform)} 开启 ${label} 编号`,
      number: '',
      state: 'open',
      fields: [
        { label: '仓库', value: ref.fullName },
        { label: '数量', value: String(items.length) },
        { label: '截断', value: options.truncated ? '是，仅统计前 1000 个' : '否' }
      ],
      bodyTitle: '编号',
      bodyParts: [{ type: 'text', text: ranges || '无' }],
      updatedAt: ''
    }
  });
};

const renderCard = async (name, payload) => {
  const item = payload.item || {};
  const platform = item.platform || 'github';
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github;
  const status = STATUS_STYLES[item.state] || {
    label: item.state || 'Unknown',
    color: style.accent,
    soft: style.accentSoft
  };
  const cleanupFiles = [];
  try {
    const localizedItem = {
      ...item,
      bodyParts: await localizeBodyImages(item.bodyParts || [], cleanupFiles)
    };
    return await puppeteer.screenshot('Git-Plugin/issue-pr-card', {
      tplFile: path.join(getPluginRoot(), 'resources', 'issue-pr-card.html'),
      saveId: `issue-pr-${platform}-${name}-${safeName(item.repo)}-${safeName(item.number)}`,
      imgType: 'png',
      quality: 100,
      card: {
        ...payload,
        item: localizedItem,
        platformLabel: platformTitle(platform),
        platformIconSvg: loadIcon(platform),
        accent: style.accent,
        accentSoft: style.accentSoft,
        status
      }
    });
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染 ${payload.kind} 图片失败: ${err?.message || err}`);
    return false;
  } finally {
    await cleanupTempFiles(cleanupFiles);
  }
};

const toIssueData = issue => ({
  platform: issue.platform,
  repo: issue.repo,
  number: issue.number,
  title: issue.title || '无标题',
  state: normalizeState(issue.state),
  fields: [
    { label: '仓库', value: issue.repo || '未知' },
    { label: '作者', value: issue.author || '未知' },
    { label: '评论', value: String(issue.comments ?? 0) },
    { label: '创建', value: formatDate(issue.createdAt) },
    { label: '更新', value: formatDate(issue.updatedAt) }
  ],
  bodyTitle: '内容',
  bodyParts: toBodyParts(issue.body)
});

const toPullData = pull => ({
  platform: pull.platform,
  repo: pull.repo,
  number: pull.number,
  title: pull.title || '无标题',
  state: pull.merged ? 'merged' : normalizeState(pull.state),
  fields: [
    { label: '仓库', value: pull.repo || '未知' },
    { label: '作者', value: pull.author || '未知' },
    { label: '分支', value: `${shorten(pull.source || '?', 22)} -> ${shorten(pull.target || '?', 22)}` },
    { label: '变更', value: `+${pull.additions} -${pull.deletions} / ${pull.changedFiles} files` },
    { label: '创建', value: formatDate(pull.createdAt) },
    { label: '更新', value: formatDate(pull.updatedAt) }
  ],
  bodyTitle: '内容',
  bodyParts: toBodyParts(pull.body)
});

const toBodyParts = value => {
  const text = String(value || '').trim();
  if (!text) return [{ type: 'text', text: '暂无内容' }];

  const parts = [];
  const imageReg = /(<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>|!\[[^\]]*]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\))/gi;
  let lastIndex = 0;
  let textLength = 0;
  let imageCount = 0;

  const pushText = raw => {
    if (textLength >= 700) return;
    const cleaned = cleanBodyText(raw);
    if (!cleaned) return;
    const left = 700 - textLength;
    const valueText = shortText(cleaned, left);
    parts.push({ type: 'text', text: valueText });
    textLength += valueText.length;
  };

  for (const match of text.matchAll(imageReg)) {
    pushText(text.slice(lastIndex, match.index));
    const url = match[2] || match[3] || '';
    if (imageCount < 3 && /^https?:\/\//i.test(url)) {
      parts.push({ type: 'image', url });
      imageCount += 1;
    }
    lastIndex = match.index + match[0].length;
  }
  pushText(text.slice(lastIndex));

  return parts.length ? parts : [{ type: 'text', text: '暂无内容' }];
};

const cleanBodyText = value => {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const localizeBodyImages = async (parts, cleanupFiles) => {
  return Promise.all(parts.map(async part => {
    if (part?.type !== 'image') return part;
    const file = await localizeImageUrl(part.url, 'issue-images');
    if (!file) return { type: 'text', text: '图片加载失败' };
    cleanupFiles.push(file);
    return { ...part, url: toFileUrl(file) };
  }));
};

const normalizeState = value => {
  const state = String(value || '').trim().toLowerCase();
  return state || 'unknown';
};

const loadIcon = platform => {
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github;
  try {
    return fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', style.icon), 'utf8');
  } catch {
    return '';
  }
};

const safeName = value => String(value || 'item').replace(/[^\w.-]+/g, '-').slice(0, 80);

const shorten = (value, limit) => {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
};
