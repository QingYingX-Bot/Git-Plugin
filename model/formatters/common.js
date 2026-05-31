import { getPlatformLabel } from '../platform.js';

export const platformTitle = value => getPlatformLabel(value);

export const shortText = (value, limit = 500) => {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
};

export const formatDate = value => {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
};

const parseErrorBody = body => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const friendlyError = err => {
  const platform = platformTitle(err?.platform || '');
  const body = parseErrorBody(err?.body);
  const remoteMessage = String(body.message || '').trim();

  if (err?.status === 401 && /bad credentials/i.test(remoteMessage)) {
    return [
      `HTTP 401 ${platform} token 无效、过期或填写错误`,
      '处理: 检查 config/config/git.yaml 中对应平台的 token，重新生成后重启机器人。'
    ];
  }

  if (err?.status === 404) {
    return [
      `HTTP 404 ${platform} 资源未找到或当前 token 无权限访问`,
      '处理: 检查 owner/repo、编号是否正确；私有仓库需要确认 token 已授权该仓库。'
    ];
  }

  return [];
};

export const formatError = err => {
  const friendly = friendlyError(err);
  if (friendly.length) return friendly.join('\n');

  const status = err?.status ? `HTTP ${err.status}` : '';
  const body = parseErrorBody(err?.body);
  const remoteMessage = body.message ? `\n接口返回: ${body.message}` : '';
  return [status, err?.message || String(err)].filter(Boolean).join(' ') + remoteMessage;
};
