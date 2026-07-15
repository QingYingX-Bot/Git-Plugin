const text = value => String(value ?? '').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const userName = user => {
  if (!user || typeof user !== 'object') return '';
  return text(user.login || user.name || user.username || user.nickname);
};

const firstUrl = (...values) => values.map(text).find(Boolean) || '';

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
  authorAvatar: firstUrl(data.author?.avatar_url, data.author?.avatar),
  committer: userName(data.committer) || userName(data.commit?.committer) || text(data.commit?.committer?.name ?? data.committer?.name),
  committerAvatar: firstUrl(data.committer?.avatar_url, data.committer?.avatar),
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
