import crypto from 'node:crypto';
import { requestJson } from '../request.js';
import { normalizeIssue, normalizePull, normalizeRateLimit, normalizeReadme, normalizeRepo } from '../normalize.js';

export class GitHubProvider {
  constructor(config = {}) {
    this.platform = 'github';
    this.apiBase = String(config.apiBase || 'https://api.github.com').replace(/\/+$/g, '');
    this.webBase = String(config.webBase || 'https://github.com').replace(/\/+$/g, '');
    this.token = String(config.token || '').trim();
    this.timeoutMs = Number(config.timeoutMs || 15000);
  }

  headers() {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Yunzai-Git-Plugin',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async getRepo(ref) {
    const data = await this.get(`/repos/${this.repoPath(ref)}`);
    return normalizeRepo(this.platform, data, this.withFallback(ref));
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
    const query = {
      state: options.state || 'all',
      sort: 'created',
      direction: 'desc',
      per_page: options.perPage || 10,
      page: options.page || 1
    };
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
    const { data, headers } = await this.getRaw('/rate_limit');
    return normalizeRateLimit(this.platform, data, headers);
  }

  buildCardUrl(ref, appendix = '') {
    const suffix = appendix || `${ref.fullName}`;
    return `https://opengraph.githubassets.com/${crypto.randomUUID().replace(/-/g, '')}/${suffix}`;
  }

  async get(path, query) {
    const { data } = await this.getRaw(path, query);
    return data;
  }

  async getRaw(path, query) {
    return requestJson(`${this.apiBase}${path}`, {
      platform: this.platform,
      headers: this.headers(),
      query,
      timeoutMs: this.timeoutMs
    });
  }

  repoPath(ref) {
    return `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  }

  withFallback(ref) {
    return { ...ref, webUrl: `${this.webBase}/${ref.fullName}` };
  }
}
