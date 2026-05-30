import { formatDate, platformTitle, shortText } from './common.js';

export const formatPull = pull => {
  const lines = [
    `${platformTitle(pull.platform)} PR #${pull.number}`,
    `仓库: ${pull.repo}`,
    `标题: ${pull.title || '无标题'}`,
    `状态: ${pull.merged ? 'merged' : pull.state || '未知'}`,
    `作者: ${pull.author || '未知'}`,
    `分支: ${pull.source || '?'} -> ${pull.target || '?'}`,
    `变更: +${pull.additions} -${pull.deletions} / ${pull.changedFiles} files`,
    `创建: ${formatDate(pull.createdAt)}`,
    `更新: ${formatDate(pull.updatedAt)}`
  ];
  if (pull.body) lines.push(`内容:\n${shortText(pull.body, 300)}`);
  if (pull.webUrl) lines.push(`链接: ${pull.webUrl}`);
  return lines.join('\n');
};
