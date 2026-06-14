import nodeFetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getGitConfig } from '../components/config.js';

let fetchRuntimeCache = null;

export class ApiRequestError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = detail.status || 0;
    this.platform = detail.platform || '';
    this.url = detail.url || '';
    this.body = detail.body || '';
  }
}

const appendQuery = (url, query = {}) => {
  const nextUrl = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      nextUrl.searchParams.set(key, String(value));
    }
  }
  return nextUrl.toString();
};

export const requestJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = appendQuery(url, options.query);

  try {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    };
    const { fetch, dispatcher } = await getFetchRuntime();
    const response = await fetch(requestUrl, dispatcher ? { ...fetchOptions, dispatcher } : fetchOptions);
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const data = text && contentType.includes('json') ? JSON.parse(text) : text;

    if (!response.ok) {
      throw new ApiRequestError(`接口请求失败: ${response.status} ${response.statusText}`, {
        status: response.status,
        platform: options.platform,
        url: requestUrl,
        body: typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      });
    }

    return { data, headers: response.headers, status: response.status };
  } catch (err) {
    if (err instanceof ApiRequestError) throw err;
    const message = err.name === 'AbortError' ? '接口请求超时' : `接口请求异常: ${formatFetchError(err)}`;
    throw new ApiRequestError(message, { platform: options.platform, url: requestUrl });
  } finally {
    clearTimeout(timer);
  }
};

const getFetchRuntime = async () => {
  const proxy = String(getGitConfig()?.proxy || '').trim();
  if (!proxy) return { fetch: nodeFetch };
  if (fetchRuntimeCache?.proxy === proxy) return fetchRuntimeCache.runtime;

  const { fetch, ProxyAgent } = await loadUndici();
  const runtime = { fetch, dispatcher: new ProxyAgent(proxy) };
  fetchRuntimeCache = { proxy, runtime };
  return runtime;
};

const loadUndici = async () => {
  try {
    return await import('undici');
  } catch (err) {
    const file = findPnpmUndici();
    if (!file) throw err;
    return import(pathToFileURL(file).href);
  }
};

const findPnpmUndici = () => {
  const store = path.join(process.cwd(), 'node_modules', '.pnpm');
  if (!fs.existsSync(store)) return '';
  const dir = fs.readdirSync(store)
    .filter(name => name.startsWith('undici@'))
    .sort()
    .at(-1);
  const file = dir ? path.join(store, dir, 'node_modules', 'undici', 'index.js') : '';
  return file && fs.existsSync(file) ? file : '';
};

const formatFetchError = err => {
  const message = String(err?.message || err || '').trim();
  const cause = String(err?.cause?.message || '').trim();
  return cause && cause !== message ? `${message}: ${cause}` : message;
};
