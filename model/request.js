import fetch from 'node-fetch';

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
    const response = await fetch(requestUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
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
    const message = err.name === 'AbortError' ? '接口请求超时' : `接口请求异常: ${err.message}`;
    throw new ApiRequestError(message, { platform: options.platform, url: requestUrl });
  } finally {
    clearTimeout(timer);
  }
};
