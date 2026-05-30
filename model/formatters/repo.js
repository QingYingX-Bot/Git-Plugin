import { formatDate, platformTitle, shortText } from './common.js';

export const formatRepo = repo => {
  const lines = [
    `${platformTitle(repo.platform)} 仓库`,
    `${repo.fullName}`,
    `描述: ${repo.description || '无'}`,
    `Stars: ${repo.stars} | Forks: ${repo.forks} | Open Issues: ${repo.openIssues}`,
    `默认分支: ${repo.defaultBranch || '未知'}`,
    `更新: ${formatDate(repo.updatedAt)}`
  ];
  if (repo.webUrl) lines.push(`链接: ${repo.webUrl}`);
  return shortText(lines.join('\n'), 1200);
};

export const formatSubscriptionList = items => {
  if (!items.length) return '当前会话没有订阅仓库';
  const lines = ['当前会话订阅仓库:'];
  for (const item of items) lines.push(`- ${item.key}`);
  return lines.join('\n');
};
