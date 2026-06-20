import fs from 'node:fs';
import path from 'node:path';
import { getPluginRoot } from '../components/config.js';
import { makeRepoKey } from './platform.js';

const dataDir = path.join(getPluginRoot(), 'data');
const files = {
  subscriptions: path.join(dataDir, 'subscriptions.json'),
  defaults: path.join(dataDir, 'defaultRepos.json'),
  linkSettings: path.join(dataDir, 'linkSettings.json'),
  lastCheck: path.join(dataDir, 'lastCheck.json'),
  repoTokens: path.join(dataDir, 'repoTokens.json'),
  lastSha: path.join(dataDir, 'lastSha.json'),
  shaHistory: path.join(dataDir, 'shaHistory.json'),
  pendingRewrite: path.join(dataDir, 'pendingRewrite.json')
};
const SHA_HISTORY_LIMIT = 50;

const readJson = file => {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    logger.error(`[Git-Plugin] 读取数据失败: ${file}`);
    logger.error(err);
    return {};
  }
};

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
};

export class RepoStore {
  constructor() {
    this.subscriptions = readJson(files.subscriptions);
    this.defaults = readJson(files.defaults);
    this.linkSettings = readJson(files.linkSettings);
    this.lastCheck = readJson(files.lastCheck);
    this.repoTokens = readJson(files.repoTokens);
    this.lastShaData = readJson(files.lastSha);
    this.shaHistory = readJson(files.shaHistory);
    this.pendingRewrite = readJson(files.pendingRewrite);
  }

  addSubscription(origin, ref, repoInfo = {}) {
    const key = makeRepoKey(ref);
    const item = this.subscriptions[key] || { ref, repoInfo, subscribers: [] };
    item.ref = ref;
    item.repoInfo = repoInfo;
    if (!item.subscribers.includes(origin)) item.subscribers.push(origin);
    this.subscriptions[key] = item;
    writeJson(files.subscriptions, this.subscriptions);
    return key;
  }

  removeSubscription(origin, ref) {
    const key = makeRepoKey(ref);
    const item = this.subscriptions[key];
    if (!item) return false;
    item.subscribers = item.subscribers.filter(value => value !== origin);
    if (item.subscribers.length) this.subscriptions[key] = item;
    else delete this.subscriptions[key];
    writeJson(files.subscriptions, this.subscriptions);
    return true;
  }

  removeAllSubscriptions(origin, platform = '') {
    const removed = [];
    for (const [key, item] of Object.entries(this.subscriptions)) {
      if (!item.subscribers?.includes(origin)) continue;
      if (platform && item.ref?.platform !== platform) continue;
      item.subscribers = item.subscribers.filter(value => value !== origin);
      removed.push(key);
      if (!item.subscribers.length) delete this.subscriptions[key];
    }
    writeJson(files.subscriptions, this.subscriptions);
    return removed;
  }

  listSubscriptions(origin, platform = '') {
    return Object.entries(this.subscriptions)
      .filter(([, item]) => item.subscribers?.includes(origin) && (!platform || item.ref?.platform === platform))
      .map(([key, item]) => ({ key, ...item }));
  }

  listAllSubscriptions() {
    return Object.entries(this.subscriptions)
      .filter(([, item]) => Array.isArray(item.subscribers) && item.subscribers.length)
      .map(([key, item]) => ({ key, ...item }));
  }

  findSubscription(key) {
    const item = this.subscriptions[key];
    return item ? { key, ...item } : null;
  }

  getLastCheck(key) {
    return this.lastCheck[key] || '';
  }

  setLastCheck(key, value = new Date().toISOString()) {
    this.lastCheck[key] = value;
    writeJson(files.lastCheck, this.lastCheck);
  }

  setDefault(origin, ref) {
    this.defaults[origin] = ref;
    writeJson(files.defaults, this.defaults);
  }

  getDefault(origin, platform = '') {
    const ref = this.defaults[origin];
    if (!ref) return null;
    if (platform && ref.platform !== platform) return null;
    return ref;
  }

  setLinkEnabled(origin, enabled) {
    this.linkSettings[origin] = Boolean(enabled);
    writeJson(files.linkSettings, this.linkSettings);
  }

  getLinkEnabled(origin, fallback) {
    return this.linkSettings[origin] ?? fallback;
  }

  getRepoToken(key) {
    return String(this.repoTokens[key] || '').trim();
  }

  setRepoToken(key, token) {
    const value = String(token || '').trim();
    if (value) this.repoTokens[key] = value;
    else delete this.repoTokens[key];
    writeJson(files.repoTokens, this.repoTokens);
  }

  removeRepoToken(key) {
    if (!(key in this.repoTokens)) return false;
    delete this.repoTokens[key];
    writeJson(files.repoTokens, this.repoTokens);
    return true;
  }

  getLastSha(key) {
    return String(this.lastShaData[key] || '').trim();
  }

  setLastSha(key, sha) {
    this.lastShaData[key] = sha;
    writeJson(files.lastSha, this.lastShaData);
  }

  getShaHistory(key) {
    const rows = this.shaHistory[key];
    return Array.isArray(rows) ? rows.map(item => String(item || '').trim()).filter(Boolean) : [];
  }

  setShaHistory(key, hashes = []) {
    const rows = [...new Set(hashes.map(item => String(item || '').trim()).filter(Boolean))].slice(0, SHA_HISTORY_LIMIT);
    if (rows.length) this.shaHistory[key] = rows;
    else delete this.shaHistory[key];
    writeJson(files.shaHistory, this.shaHistory);
  }

  getPendingRewrite(key) {
    const item = this.pendingRewrite[key];
    return item && typeof item === 'object' ? item : null;
  }

  setPendingRewrite(key, rewrite) {
    if (rewrite && typeof rewrite === 'object') this.pendingRewrite[key] = rewrite;
    else delete this.pendingRewrite[key];
    writeJson(files.pendingRewrite, this.pendingRewrite);
  }

  clearPendingRewrite(key) {
    if (!(key in this.pendingRewrite)) return false;
    delete this.pendingRewrite[key];
    writeJson(files.pendingRewrite, this.pendingRewrite);
    return true;
  }
}
