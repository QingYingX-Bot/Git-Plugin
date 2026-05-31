import { cleanupTempFiles, localizeImageUrl, toDataUrl } from './renderAssets.js';
import { getGitConfig } from '../components/config.js';

export { cleanupTempFiles };

export const localizeRenderedReadmeHtml = async (html, readme, cleanupFiles) => {
  const text = String(html || '');
  const imageReg = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const urls = [...new Set([...text.matchAll(imageReg)].map(item => item[1]))]
    .filter(url => /^https?:\/\//i.test(resolveReadmeUrl(url, readme)))
    .slice(0, 24);
  if (!urls.length) return text;

  const pairs = await localizeUrls(urls, readme, cleanupFiles, 3);
  const map = new Map(pairs);
  return text.replace(imageReg, match => {
    const src = htmlAttr(match, 'src');
    const local = map.get(src);
    return local ? match.replace(src, local) : match;
  });
};

export const localizeMarkdownImages = async (markdown, readme, cleanupFiles) => {
  const imageReg = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const urls = [...new Set([...String(markdown).matchAll(imageReg)].map(item => item[1]))]
    .filter(url => /^https?:\/\//i.test(resolveReadmeUrl(url, readme)))
    .slice(0, 24);
  if (!urls.length) return new Map();

  const pairs = await localizeUrls(urls, readme, cleanupFiles, 3);
  return new Map(pairs);
};

const localizeUrls = async (urls, readme, cleanupFiles, limit) => {
  const start = Date.now();
  const log = shouldLogDownloads();
  if (log) logger.mark?.(`[Git-Plugin] 开始下载 README 图片: ${urls.length} 张`);
  const pairs = await mapLimit(urls, limit, async url => {
    const resolved = resolveReadmeUrl(url, readme);
    const file = await localizeImageUrl(resolved, 'readme-images');
    if (file) cleanupFiles.push(file);
    return [url, file ? await toDataUrl(file) : ''];
  });
  const success = pairs.filter(([, file]) => file).length;
  if (log) logger.mark?.(`[Git-Plugin] README 图片下载完成: ${success}/${urls.length} 张 ${Date.now() - start}ms`);
  return pairs;
};

const resolveReadmeUrl = (url, readme = {}) => {
  const text = decodeUrlText(url);
  if (!text || /^(?:data|file|blob):/i.test(text)) return '';
  if (/^https?:\/\//i.test(text)) return text;

  const rawBase = readme.raw?.download_url || readme.webUrl || '';
  if (!rawBase) return text;
  try {
    return new URL(text, rawBase).toString();
  } catch {
    return text;
  }
};

const decodeUrlText = url => String(url || '')
  .trim()
  .replace(/&amp;/gi, '&')
  .replace(/\\([\\`*{}\[\]()#+\-.!_>&])/g, '$1');

const mapLimit = async (items, limit, handler) => {
  const result = [];
  for (let index = 0; index < items.length; index += limit) {
    result.push(...await Promise.all(items.slice(index, index + limit).map(handler)));
  }
  return result;
};

const htmlAttr = (attrs, name) => {
  const match = String(attrs || '').match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : '';
};

const shouldLogDownloads = () => {
  try {
    return Boolean(getGitConfig()?.renderImageDownloadLog);
  } catch {
    return false;
  }
};
