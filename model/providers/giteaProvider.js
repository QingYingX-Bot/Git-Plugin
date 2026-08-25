import { requestJson } from '../request.js';
import { normalizeCommit, normalizeIssue, normalizePull, normalizeRateLimit, normalizeReadme, normalizeRepo } from '../normalize.js';
import { normalizeInstanceUrl, resolveInstanceAssetUrl } from '../platform.js';

const README_CANDIDATES = ['README.md', 'README.MD', 'readme.md'];

export class GiteaProvider {
  constructor(config = {}, ref = {}) {
    this.platform = 'gitea';
    this.instance = normalizeInstanceUrl(ref.instance) || normalizeInstanceUrl(config.baseUrl);
    this.apiBase = this.instance.endsWith('/api/v1') ? this.instance : `${this.instance}/api/v1`;
    this.token = String(config.token || '').trim();
    this.timeoutMs = Number(config.timeoutMs || 15000);
    this.userAvatarCache = new Map();
  }

  headers() {
    const headers = { Accept: 'application/json', 'User-Agent': 'Yunzai-Git-Plugin' };
    if (this.token) headers.Authorization = `token ${this.token}`;
    return headers;
  }

  async getRepo(ref) {
    this.assertInstance();
    const data = await this.get(`/repos/${this.repoPath(ref)}`);
    return normalizeRepo(this.platform, data, this.withFallback(ref));
  }

  async listCommits(ref, options = {}) {
    this.assertInstance();
    const query = {
      limit: options.perPage || 10,
      page: options.page || 1,
      sha: ref.branch || undefined,
      stat: true,
      files: true
    };
    const data = await this.get(`/repos/${this.repoPath(ref)}/commits`, query);
    if (!Array.isArray(data)) return [];
    const commits = data.map(item => normalizeCommit(this.platform, item, this.withFallback(ref)));
    await this.fillMissingCommitAvatars(commits);
    return commits;
  }

  async listIssues(ref, options = {}) {
    this.assertInstance();
    const query = { state: options.state || 'all', limit: options.perPage || 10, page: options.page || 1 };
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues`, query);
    return Array.isArray(data) ? data.map(item => normalizeIssue(this.platform, item, this.withFallback(ref))) : [];
  }

  async getIssue(ref, number) {
    this.assertInstance();
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues/${encodeURIComponent(number)}`);
    return normalizeIssue(this.platform, data, { ...this.withFallback(ref), number });
  }

  async listPulls(ref, options = {}) {
    this.assertInstance();
    const query = { state: options.state || 'all', limit: options.perPage || 10, page: options.page || 1 };
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls`, query);
    return Array.isArray(data) ? data.map(item => normalizePull(this.platform, item, this.withFallback(ref))) : [];
  }

  async getPull(ref, number) {
    this.assertInstance();
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls/${encodeURIComponent(number)}`);
    return normalizePull(this.platform, data, { ...this.withFallback(ref), number });
  }

  async getReadme(ref) {
    this.assertInstance();
    for (const name of README_CANDIDATES) {
      try {
        const data = await this.get(`/repos/${this.repoPath(ref)}/contents/${encodeURIComponent(name)}`);
        return normalizeReadme(this.platform, data, { ...this.withFallback(ref), name });
      } catch (err) {
        if (err.status && err.status !== 404) throw err;
      }
    }
    throw new Error('未找到 README 文件');
  }

  async getRateLimit() {
    return normalizeRateLimit(this.platform);
  }

  buildCardUrl() {
    return '';
  }

  async get(path, query = {}) {
    const { data } = await requestJson(`${this.apiBase}${path}`, {
      platform: this.platform,
      headers: this.headers(),
      query,
      timeoutMs: this.timeoutMs
    });
    return data;
  }

  repoPath(ref) {
    return `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  }

  withFallback(ref) {
    return { ...ref, instance: this.instance, webUrl: `${this.instance}/${ref.fullName}` };
  }

  getAvatarRequestOptions() {
    return {
      baseUrl: this.instance,
      headers: this.token ? { Authorization: `token ${this.token}` } : {}
    };
  }

  async fillMissingCommitAvatars(commits) {
    await Promise.all(commits.map(async commit => {
      if (!commit.authorAvatar) {
        commit.authorAvatar = await this.findUserAvatar(commit, 'author');
      }
      if (!commit.committerAvatar) {
        commit.committerAvatar = await this.findUserAvatar(commit, 'committer');
      }
    }));
  }

  async findUserAvatar(commit, role) {
    const raw = commit.raw || {};
    const linked = raw[role] || {};
    const gitUser = raw.commit?.[role] || {};
    const queries = [
      linked.login,
      linked.username,
      gitUser.username,
      gitUser.email,
      gitUser.name
    ].map(value => String(value || '').trim()).filter(Boolean);

    for (const query of queries) {
      const cacheKey = query.toLowerCase();
      if (!this.userAvatarCache.has(cacheKey)) {
        this.userAvatarCache.set(cacheKey, this.searchUserAvatar(query).catch(() => ''));
      }
      const avatar = await this.userAvatarCache.get(cacheKey);
      if (avatar) return avatar;
    }
    return '';
  }

  async searchUserAvatar(query) {
    const result = await this.get('/users/search', { q: query, limit: 5 });
    const users = Array.isArray(result?.data) ? result.data : [];
    const key = String(query || '').trim().toLowerCase();
    const user = users.find(item => [
      item.login,
      item.username,
      item.full_name,
      item.email
    ].some(value => String(value || '').trim().toLowerCase() === key)) || (users.length === 1 ? users[0] : null);
    return resolveInstanceAssetUrl(user?.avatar_url, this.instance);
  }

  assertInstance() {
    if (!this.instance) throw new Error('Gitea 实例地址未配置');
  }
}
