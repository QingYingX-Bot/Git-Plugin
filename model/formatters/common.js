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

export const formatError = err => {
  const status = err?.status ? `HTTP ${err.status}` : '';
  const detail = err?.body ? `\n${err.body}` : '';
  return [status, err?.message || String(err)].filter(Boolean).join(' ') + detail;
};
