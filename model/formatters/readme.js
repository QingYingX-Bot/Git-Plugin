import { platformTitle, shortText } from './common.js';

export const formatReadme = readme => {
  const title = `${platformTitle(readme.platform)} README | ${readme.repo}`;
  const content = readme.content ? shortText(readme.content, 1600) : 'README 内容为空';
  const lines = [title, '', content];
  if (readme.webUrl) lines.push('', `链接: ${readme.webUrl}`);
  return lines.join('\n');
};
