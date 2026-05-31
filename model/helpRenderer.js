import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';

const ICON_FILES = {
  github: 'github.svg',
  gitee: 'gitee.svg',
  gitcode: 'gitcode.svg',
  gitea: 'gitea.svg'
};

const PLATFORMS = [
  { id: 'github', name: 'GitHub', command: '#githubrepo', target: 'owner/repo' },
  { id: 'gitee', name: 'Gitee', command: '#giteerepo', target: 'owner/repo' },
  { id: 'gitcode', name: 'GitCode', command: '#gitcoderepo', target: 'owner/repo' },
  { id: 'gitea', name: 'Gitea', command: '#gitearepo', target: 'https://gitea.example.com owner/repo' }
];

const GROUPS = [
  {
    title: '查询',
    items: [
      ['#gitrepo github owner/repo', '查询仓库信息'],
      ['#gitissue github owner/repo#1', '查询 Issue 详情'],
      ['#gitissue github owner/repo', '列出开启 Issue 编号'],
      ['#gitpr github owner/repo#1', '查询 PR 详情'],
      ['#gitpr github owner/repo', '列出开启 PR 编号'],
      ['#gitreadme github owner/repo', '查看 README'],
      ['#gitlimit', '查看 API 限流']
    ]
  },
  {
    title: '订阅',
    compact: true,
    items: [
      ['#gitsub github owner/repo', '订阅仓库推送'],
      ['#gitunsub github owner/repo', '取消仓库订阅'],
      ['#githubunsub', '取消 GitHub 全部订阅'],
      ['#gitlist', '查看当前会话订阅'],
      ['#gitlist github', '查看指定平台订阅']
    ]
  },
  {
    title: '设置',
    compact: true,
    items: [
      ['#gitdefault github owner/repo', '设置默认仓库'],
      ['#githubdefault', '查看 GitHub 默认仓库'],
      ['#gitlink on', '开启链接自动解析'],
      ['#gitlink off', '关闭链接自动解析'],
      ['#gt帮助', '查看本帮助图']
    ]
  }
];

const TIPS = [
  '通用命令第一个参数填写平台：github / gitee / gitcode / gitea。',
  'Gitea 需要带实例地址，例如 https://gitea.example.com。',
  'Issue / PR 只填仓库时，会返回开启编号列表，连续编号会合并为 1~4。',
  'Webhook 默认推送 Issues、PR 和 Push，closed 事件由配置项控制。',
  'GitHub 卡片可选择官方 OpenGraph 或插件统一模板。'
];

export const renderGitHelp = async () => {
  const data = {
    tplFile: path.join(getPluginRoot(), 'resources', 'help.html'),
    saveId: 'git-plugin-help',
    imgType: 'png',
    quality: 100,
    help: {
      title: 'Git-Plugin 帮助',
      subtitle: 'GitHub / Gitee / GitCode / Gitea 仓库助手',
      platforms: PLATFORMS.map(item => ({ ...item, iconSvg: loadIcon(item.id) })),
      groups: GROUPS.map(group => ({
        ...group,
        items: group.items.map(([command, description]) => ({ command, description }))
      })),
      tips: TIPS
    }
  };
  return puppeteer.screenshot('Git-Plugin/help', data);
};

export const formatGitHelpText = () => [
  'Git-Plugin 帮助',
  '#gitrepo github owner/repo - 查询仓库',
  '#gitissue github owner/repo#1 - 查询 Issue',
  '#gitpr github owner/repo#1 - 查询 PR',
  '#gitreadme github owner/repo - 查看 README',
  '#gitsub github owner/repo - 订阅仓库',
  '#gitlist - 查看订阅',
  '#gitlink on/off - 链接解析开关'
].join('\n');

const loadIcon = platform => {
  const fileName = ICON_FILES[platform];
  if (!fileName) return '';
  try {
    return fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', fileName), 'utf8');
  } catch {
    return '';
  }
};
