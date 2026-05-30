import { formatDate, platformTitle } from './common.js';

export const formatRateLimit = info => {
  if (!info.supported) return `${platformTitle(info.platform)} 当前 Provider 未提供限流查询接口`;
  const reset = info.reset ? formatDate(info.reset * 1000) : '未知';
  return [
    `${platformTitle(info.platform)} API 限流`,
    `剩余: ${info.remaining}/${info.limit}`,
    `重置: ${reset}`
  ].join('\n');
};
