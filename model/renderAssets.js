import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fetch from 'node-fetch';
import { getGitConfig } from '../components/config.js';

const TEMP_ROOT = path.join(process.cwd(), 'temp', 'Git-Plugin');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CURL_EXEC_TIMEOUT_MS = 15000;

export const localizeImageUrl = async (url, scope = 'images') => {
  const text = String(url || '').trim();
  if (!/^https?:\/\//i.test(text)) return '';

  const options = getRenderOptions();
  const proxy = options.proxy;
  const start = Date.now();
  if (options.downloadLog) logDownloadStart(text, scope, proxy);
  const curlFile = await downloadWithCurl(text, scope, proxy);
  if (curlFile) {
    if (options.downloadLog) await logDownloadSuccess(curlFile, 'curl', text, start);
    return curlFile;
  }

  const fetchFile = await downloadWithFetch(text, scope);
  if (fetchFile && options.downloadLog) await logDownloadSuccess(fetchFile, 'fetch', text, start);
  return fetchFile;
};

export const toFileUrl = file => pathToFileURL(file).href;

export const toDataUrl = async file => {
  const buffer = await fs.promises.readFile(file);
  return `data:${mimeByFile(file)};base64,${buffer.toString('base64')}`;
};

export const cleanupTempFiles = async files => {
  await Promise.all(files.map(file => fs.promises.unlink(file).catch(() => {})));
};

const downloadWithFetch = async (url, scope) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const dir = path.join(TEMP_ROOT, scope);
    fs.mkdirSync(dir, { recursive: true });
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Yunzai-Git-Plugin' },
      signal: controller.signal
    });
    if (!response.ok) return '';

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return '';

    const size = Number(response.headers.get('content-length') || 0);
    if (size > MAX_IMAGE_BYTES) return '';

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return '';

    const file = path.join(dir, `${randomUUID()}${imageExt(contentType)}`);
    await fs.promises.writeFile(file, buffer);
    return file;
  } catch (err) {
    logDownloadDebug(err, 'fetch');
    return '';
  } finally {
    clearTimeout(timer);
  }
};

const downloadWithCurl = async (url, scope, proxy) => {
  const dir = path.join(TEMP_ROOT, scope);
  fs.mkdirSync(dir, { recursive: true });
  const tempFile = path.join(dir, `${randomUUID()}.download`);
  try {
    await execFileAsync('curl', ['-L', url, '-o', tempFile], {
      timeout: CURL_EXEC_TIMEOUT_MS,
      env: proxy ? withProxyEnv(process.env, proxy) : process.env
    });

    const stat = await fs.promises.stat(tempFile);
    if (!stat.size || stat.size > MAX_IMAGE_BYTES) return await removeAndEmpty(tempFile);

    const imageType = await detectImageType(tempFile);
    if (!imageType) return await removeAndEmpty(tempFile);

    const file = path.join(dir, `${randomUUID()}${imageExt(imageType)}`);
    await fs.promises.rename(tempFile, file);
    return file;
  } catch (err) {
    await fs.promises.unlink(tempFile).catch(() => {});
    logDownloadDebug(err, 'curl');
    return '';
  }
};

const execFileAsync = (cmd, args, options) => new Promise((resolve, reject) => {
  execFile(cmd, args, options, (err, stdout, stderr) => {
    if (err) {
      err.stderr = stderr;
      reject(err);
      return;
    }
    resolve({ stdout, stderr });
  });
});

const removeAndEmpty = async file => {
  await fs.promises.unlink(file).catch(() => {});
  return '';
};

const logDownloadDebug = (err, method = 'download') => {
  const message = compactErrorMessage(err);
  globalThis.logger?.warn?.(`[Git-Plugin] 下载渲染图片失败[${method}]: ${message}`);
};

const getRenderOptions = () => {
  try {
    const config = getGitConfig();
    return {
      proxy: String(config?.proxy || '').trim(),
      downloadLog: Boolean(config?.renderImageDownloadLog)
    };
  } catch {
    return { proxy: '', downloadLog: false };
  }
};

const withProxyEnv = (env, proxy) => ({
  ...env,
  HTTP_PROXY: proxy,
  HTTPS_PROXY: proxy,
  http_proxy: proxy,
  https_proxy: proxy
});

const logDownloadStart = (url, scope, proxy) => {
  const proxyText = proxy ? ` proxy=${proxy}` : '';
  logVisible(`[Git-Plugin] 开始下载渲染图片[${scope}${proxyText}]: ${shortUrl(url)}`);
};

const logDownloadSuccess = async (file, method, url, start) => {
  const stat = await fs.promises.stat(file).catch(() => ({ size: 0 }));
  logVisible(`[Git-Plugin] 下载渲染图片成功[${method}]: ${formatSize(stat.size)} ${Date.now() - start}ms ${shortUrl(url)}`);
};

const logVisible = message => {
  const logger = globalThis.logger;
  if (logger?.mark) {
    logger.mark(message);
    return;
  }
  logger?.info?.(message);
};

const compactErrorMessage = err => {
  if (err?.signal === 'SIGTERM') return `curl 执行超过 ${CURL_EXEC_TIMEOUT_MS / 1000}s，已跳过`;
  const stderr = String(err?.stderr || '').trim().split('\n').filter(Boolean).at(-1);
  const message = String(err?.message || err || '').trim().split('\n').filter(Boolean).at(0);
  return stderr || message || 'unknown error';
};

const shortUrl = url => {
  const text = String(url || '');
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
};

const formatSize = bytes => {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${value}B`;
};

const detectImageType = async file => {
  const buffer = await fs.promises.readFile(file);
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';

  const head = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  return '';
};

const imageExt = contentType => {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };
  return map[type] || '.img';
};

const mimeByFile = file => {
  const ext = path.extname(String(file || '')).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
};
