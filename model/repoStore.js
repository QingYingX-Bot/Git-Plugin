import fs from 'node:fs';
import path from 'node:path';
import { getPluginRoot } from '../components/config.js';
import { makeRepoKey } from './platform.js';

const dataDir = path.join(getPluginRoot(), 'data');
const files = {
  subscriptions: path.join(dataDir, 'subscriptions.json'),
  defaults: path.join(dataDir, 'defaultRepos.json'),
  linkSettings: path.join(dataDir, 'linkSettings.json'),
  lastCheck: path.join(dataDir, 'lastCheck.json')
};

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
}
