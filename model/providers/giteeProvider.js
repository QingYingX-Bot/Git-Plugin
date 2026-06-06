import { requestJson } from '../request.js';
import { normalizeCommit, normalizeIssue, normalizePull, normalizeRateLimit, normalizeReadme, normalizeRepo } from '../normalize.js';

export class GiteeProvider {
  constructor(config = {}) {
    this.platform = 'gitee';
    this.apiBase = String(config.apiBase || 'https://gitee.com/api/v5').replace(/\/+$/g, '');
    this.webBase = String(config.webBase || 'https://gitee.com').replace(/\/+$/g, '');
    this.token = String(config.token || '').trim();
    this.timeoutMs = Number(config.timeoutMs || 15000);
  }

  async getRepo(ref) {
    const data = await this.get(`/repos/${this.repoPath(ref)}`);
    return normalizeRepo(this.platform, data, this.withFallback(ref));
  }

  async listCommits(ref, options = {}) {
    const query = {
      per_page: options.perPage || 10,
      page: options.page || 1,
      sha: ref.branch || undefined
    };
    const data = await this.get(`/repos/${this.repoPath(ref)}/commits`, query);
    return Array.isArray(data) ? data.map(item => normalizeCommit(this.platform, item, this.withFallback(ref))) : [];
  }

  async listIssues(ref, options = {}) {
    const query = {
      state: options.state || 'all',
      sort: 'created',
      direction: 'desc',
      per_page: options.perPage || 10,
      page: options.page || 1
    };
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues`, query);
    return Array.isArray(data) ? data.map(item => normalizeIssue(this.platform, item, this.withFallback(ref))) : [];
  }

  async getIssue(ref, number) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues/${encodeURIComponent(number)}`);
    return normalizeIssue(this.platform, data, { ...this.withFallback(ref), number });
  }

  async listPulls(ref, options = {}) {
    const query = { state: options.state || 'all', page: options.page || 1, per_page: options.perPage || 10 };
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls`, query);
    return Array.isArray(data) ? data.map(item => normalizePull(this.platform, item, this.withFallback(ref))) : [];
  }

  async getPull(ref, number) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls/${encodeURIComponent(number)}`);
    return normalizePull(this.platform, data, { ...this.withFallback(ref), number });
  }

  async getReadme(ref) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/readme`);
    return normalizeReadme(this.platform, data, this.withFallback(ref));
  }

  async getRateLimit() {
    return normalizeRateLimit(this.platform);
  }

  buildCardUrl() {
    return '';
  }

  async get(path, query = {}) {
    const authQuery = this.token ? { access_token: this.token } : {};
    const { data } = await requestJson(`${this.apiBase}${path}`, {
      platform: this.platform,
      headers: { Accept: 'application/json', 'User-Agent': 'Yunzai-Git-Plugin' },
      query: { ...query, ...authQuery },
      timeoutMs: this.timeoutMs
    });
    return data;
  }

  repoPath(ref) {
    return `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  }

  withFallback(ref) {
    return { ...ref, webUrl: `${this.webBase}/${ref.fullName}` };
  }
}
