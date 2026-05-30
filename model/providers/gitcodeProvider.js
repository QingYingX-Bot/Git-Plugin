import { requestJson } from '../request.js';
import { normalizeIssue, normalizePull, normalizeRateLimit, normalizeReadme, normalizeRepo } from '../normalize.js';

const README_CANDIDATES = ['README.md', 'README.MD', 'readme.md'];

export class GitCodeProvider {
  constructor(config = {}) {
    this.platform = 'gitcode';
    this.apiBase = String(config.apiBase || 'https://api.gitcode.com/api/v5').replace(/\/+$/g, '');
    this.webBase = String(config.webBase || 'https://gitcode.com').replace(/\/+$/g, '');
    this.token = String(config.token || '').trim();
    this.timeoutMs = Number(config.timeoutMs || 15000);
  }

  headers() {
    const headers = { Accept: 'application/json', 'User-Agent': 'Yunzai-Git-Plugin' };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
      headers['PRIVATE-TOKEN'] = this.token;
    }
    return headers;
  }

  async getRepo(ref) {
    const data = await this.get(`/repos/${this.repoPath(ref)}`);
    return normalizeRepo(this.platform, data, this.withFallback(ref));
  }

  async listIssues(ref, options = {}) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues`, { state: options.state || 'all', per_page: options.perPage || 10 });
    return Array.isArray(data) ? data.map(item => normalizeIssue(this.platform, item, this.withFallback(ref))) : [];
  }

  async getIssue(ref, number) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/issues/${encodeURIComponent(number)}`);
    return normalizeIssue(this.platform, data, { ...this.withFallback(ref), number });
  }

  async listPulls(ref, options = {}) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls`, { state: options.state || 'all', per_page: options.perPage || 10 });
    return Array.isArray(data) ? data.map(item => normalizePull(this.platform, item, this.withFallback(ref))) : [];
  }

  async getPull(ref, number) {
    const data = await this.get(`/repos/${this.repoPath(ref)}/pulls/${encodeURIComponent(number)}`);
    return normalizePull(this.platform, data, { ...this.withFallback(ref), number });
  }

  async getReadme(ref) {
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
      query: this.token ? { ...query, access_token: this.token } : query,
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
