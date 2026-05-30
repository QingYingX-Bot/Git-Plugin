import { formatDate, platformTitle, shortText } from './common.js';

export const formatIssue = issue => {
  const type = issue.isPull ? 'Issue/PR' : 'Issue';
  const lines = [
    `${platformTitle(issue.platform)} ${type} #${issue.number}`,
    `仓库: ${issue.repo}`,
    `标题: ${issue.title || '无标题'}`,
    `状态: ${issue.state || '未知'}`,
    `作者: ${issue.author || '未知'}`,
    `评论: ${issue.comments}`,
    `创建: ${formatDate(issue.createdAt)}`,
    `更新: ${formatDate(issue.updatedAt)}`
  ];
  if (issue.body) lines.push(`内容:\n${shortText(issue.body, 300)}`);
  if (issue.webUrl) lines.push(`链接: ${issue.webUrl}`);
  return lines.join('\n');
};
