import { requestJson } from '../request.js';
import { normalizeIssue, normalizePull, normalizeRateLimit, normalizeReadme, normalizeRepo } from '../normalize.js';

const README_CANDIDATES = ['README.md', 'README.MD', 'readme.md'];

export class GiteaProvider {
  constructor(config = {}, ref = {}) {
    this.platform = 'gitea';
    this.instance = String(ref.instance || config.baseUrl || '').replace(/\/+$/g, '');
    this.apiBase = this.instance.endsWith('/api/v1') ? this.instance : `${this.instance}/api/v1`;
    this.token = String(config.token || '').trim();
    this.timeoutMs = Number(config.timeoutMs || 15000);
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

  assertInstance() {
    if (!this.instance) throw new Error('Gitea 实例地址未配置');
  }
}
