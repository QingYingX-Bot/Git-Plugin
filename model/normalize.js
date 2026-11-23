import { resolveInstanceAssetUrl } from './platform.js';

const text = value => String(value ?? '').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const userName = user => {
  if (!user || typeof user !== 'object') return '';
  return text(user.login || user.name || user.username || user.nickname);
};

const firstUrl = (...values) => values.map(text).find(Boolean) || '';

/**
 * 抽取 fork 上游仓库的标识与地址。
 *
 * 三个平台的字段口径不一致，统一收敛在这里：
 *   - GitHub：parent 是直接父级，source 才是这条 fork 链的终点；多层 fork 时
 *     用 source 才不会链到中间层。
 *   - GitCode：parent 结构与 GitHub 类似，另有个顶层的 parentfull_name 字符串兜底。
 *   - Gitee：只有 parent。
 * 取不到就返回空，调用方据此判断是否展示 fork 行。
 */
const pickForkParent = (data = {}) => {
  const source = data.source && typeof data.source === 'object' ? data.source : null;
  const parent = data.parent && typeof data.parent === 'object' ? data.parent : null;
  const picked = source || parent || null;
  const name = text(
    picked?.full_name ||
    picked?.path_with_namespace ||
    data.parentfull_name ||
    ''
  );
  const url = firstUrl(picked?.html_url, picked?.web_url, picked?.url);
  return { name, url };
};

/**
 * 识别平台官方维护的镜像 / 加速下载仓库。
 *
 * 这类仓库不是 fork（fork=false、parent=null），平台也不给上游地址，
 * 但 full_name / human_name 有稳定特征：
 *   - GitCode：`gh_mirrors/<首字母>/<仓库名>`，human_name 前缀「GitHub 加速计划」
 *     另有同类命名空间 GitHub_Trending，human_name 前缀「GitHub推荐项目精选」
 *   - Gitee：`mirrors/<仓库名>`（两段式），human_name 前缀「Gitee 极速下载」
 *     owner 显示名是「极速 Gitee」
 * 上游地址无法从路径反推（gh_mirrors/le/Leonida 的 le 是分类不是 owner），
 * 所以只标注「是镜像」，不生成上游链接。
 */
const MIRROR_RULES = [
  { platform: 'gitcode', prefix: 'GitHub 加速计划', label: 'GitHub 加速计划' },
  { platform: 'gitcode', prefix: 'GitHub推荐项目精选', label: 'GitHub 推荐精选' },
  { platform: 'gitee', prefix: 'Gitee 极速下载', label: 'Gitee 极速下载' },
];

const pickMirror = (platform, data = {}, fullName = '') => {
  const humanName = text(data.human_name);
  const rule = MIRROR_RULES.find(item => item.platform === platform && humanName.startsWith(item.prefix));
  if (!rule) return null;
  /**
   * 命名空间：GitCode 三段式取前两段当归属（gh_mirrors/le），
   * Gitee 两段式取第一段（mirrors）。展示成「镜像名 / 分类」的形式。
   */
  const parts = String(fullName).split('/').filter(Boolean);
  const hasCategory = parts.length >= 3;
  return {
    label: rule.label,
    owner: hasCategory ? `${parts[0]} / ${parts[1]}` : parts[0] || '',
    category: hasCategory ? parts[1] : '',
    shortName: parts[parts.length - 1] || '',
  };
};

export const normalizeRepo = (platform, data = {}, fallback = {}) => {
  const owner = text(fallback.owner || data.owner?.login || data.owner?.name || data.namespace?.path);
  const repo = text(fallback.repo || data.name || data.path);
  const fullName = text(data.full_name || data.path_with_namespace || `${owner}/${repo}`);
  const avatarUrl = firstUrl(
    data.avatar_url,
    data.owner?.avatar_url,
    data.owner?.avatar,
    data.namespace?.avatar_url,
    data.namespace?.avatar,
    data.creator?.avatar_url,
    fallback.avatarUrl
  );
  const forkParent = pickForkParent(data);
  const mirrorInfo = pickMirror(platform, data, fullName);
  return {
    platform,
    instance: fallback.instance || '',
    owner,
    repo,
    fullName,
    avatarUrl,
    description: text(data.description),
    defaultBranch: text(data.default_branch || data.defaultBranch),
    stars: number(data.stargazers_count ?? data.stars_count ?? data.star_count),
    forks: number(data.forks_count ?? data.fork_count),
    openIssues: number(data.open_issues_count ?? data.open_issues),
    webUrl: firstUrl(data.html_url, data.web_url, data.url, fallback.webUrl),
    updatedAt: text(data.updated_at || data.pushed_at),
    /**
     * fork 信息：isFork 表示这本身是 fork，parentName 是上游完整名。
     * 上游星数不额外请求（GitHub/Gitee 要再打一次 API），只用仓库自身数据。
     */
    isFork: Boolean(data.fork),
    parentName: forkParent.name,
    parentUrl: forkParent.url,
    /** 官方镜像仓库：isMirror 为真时卡片走镜像样式 */
    isMirror: Boolean(mirrorInfo),
    mirrorLabel: mirrorInfo?.label || '',
    mirrorOwner: mirrorInfo?.owner || '',
    mirrorShortName: mirrorInfo?.shortName || '',
    raw: data
  };
};

export const normalizeCommit = (platform, data = {}, fallback = {}) => ({
  platform,
  instance: fallback.instance || '',
  repo: fallback.fullName || '',
  sha: text(data.sha ?? data.id),
  message: text(data.commit?.message ?? data.message ?? data.title),
  author: userName(data.author) || userName(data.commit?.author) || text(data.commit?.author?.name ?? data.author?.name),
  authorAvatar: resolveInstanceAssetUrl(firstUrl(data.author?.avatar_url, data.author?.avatar), fallback.instance),
  committer: userName(data.committer) || userName(data.commit?.committer) || text(data.commit?.committer?.name ?? data.committer?.name),
  committerAvatar: resolveInstanceAssetUrl(firstUrl(data.committer?.avatar_url, data.committer?.avatar), fallback.instance),
  createdAt: text(data.commit?.author?.date ?? data.created_at ?? data.date),
  committedAt: text(data.commit?.committer?.date ?? data.committed_date ?? data.committer?.date ?? data.created_at ?? data.date),
  webUrl: firstUrl(data.html_url, data.web_url),
  raw: data
});

export const normalizeIssue = (platform, data = {}, fallback = {}) => ({
  platform,
  instance: fallback.instance || '',
  repo: fallback.fullName || '',
  number: text(data.number ?? data.index ?? fallback.number),
  title: text(data.title),
  state: text(data.state),
  author: userName(data.user || data.author),
  body: text(data.body || data.content || data.description),
  comments: number(data.comments),
  createdAt: text(data.created_at),
  updatedAt: text(data.updated_at),
  webUrl: firstUrl(data.html_url, data.web_url),
  isPull: Boolean(data.pull_request),
  raw: data
});

export const normalizePull = (platform, data = {}, fallback = {}) => ({
  platform,
  instance: fallback.instance || '',
  repo: fallback.fullName || '',
  number: text(data.number ?? data.index ?? fallback.number),
  title: text(data.title),
  state: text(data.state),
  author: userName(data.user || data.author),
  body: text(data.body || data.content || data.description),
  source: text(data.head?.label || data.head?.ref || data.source_branch),
  target: text(data.base?.label || data.base?.ref || data.target_branch),
  merged: Boolean(data.merged || data.merged_at),
  additions: number(data.additions),
  deletions: number(data.deletions),
  changedFiles: number(data.changed_files),
  createdAt: text(data.created_at),
  updatedAt: text(data.updated_at),
  webUrl: firstUrl(data.html_url, data.web_url),
  raw: data
});

export const normalizeReadme = (platform, data = {}, fallback = {}) => {
  const encoded = text(data.content).replace(/\s/g, '');
  let content = text(data.text || data.raw);
  if (!content && encoded) {
    const encoding = text(data.encoding).toLowerCase();
    if (encoding === 'base64') {
      try {
        content = Buffer.from(encoded, 'base64').toString('utf8');
      } catch {
        content = '';
      }
    } else {
      content = text(data.content);
    }
  }
  return {
    platform,
    instance: fallback.instance || '',
    repo: fallback.fullName || '',
    name: text(data.name || fallback.name || 'README.md'),
    content,
    html: text(data.html || data.rendered_html || fallback.html),
    webUrl: firstUrl(data.html_url, data.web_url, data.download_url),
    raw: data
  };
};

export const normalizeRateLimit = (platform, data = {}, headers) => {
  const core = data.resources?.core || {};
  return {
    platform,
    supported: Boolean(data.resources || headers?.get?.('x-ratelimit-limit')),
    limit: number(core.limit || headers?.get?.('x-ratelimit-limit')),
    remaining: number(core.remaining || headers?.get?.('x-ratelimit-remaining')),
    reset: number(core.reset || headers?.get?.('x-ratelimit-reset')),
    raw: data
  };
};
