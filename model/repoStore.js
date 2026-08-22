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
  pendingRewrite: path.join(dataDir, 'pendingRewrite.json'),
  deliveryHistory: path.join(dataDir, 'deliveryHistory.json')
};
const SHA_HISTORY_LIMIT = 50;
const DELIVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERY_HISTORY_LIMIT = 2000;

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
    this.deliveryHistory = readJson(files.deliveryHistory);
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

  claimDeliveryTargets(eventKey, targets = [], now = Date.now()) {
    const uniqueTargets = dedupeTargets(targets);
    const key = String(eventKey || '').trim();
    if (!key || !uniqueTargets.length) return uniqueTargets;

    let changed = pruneDeliveryHistory(this.deliveryHistory, now);
    const event = this.deliveryHistory[key] || {};
    const allowed = [];

    for (const target of uniqueTargets) {
      const targetKey = targetDedupKey(target);
      const claimedAt = Number(event[targetKey] || 0);
      if (claimedAt && now - claimedAt <= DELIVERY_TTL_MS) continue;
      event[targetKey] = now;
      allowed.push(target);
      changed = true;
    }

    if (allowed.length) this.deliveryHistory[key] = event;
    if (pruneHistorySize(this.deliveryHistory)) changed = true;
    if (changed) writeJson(files.deliveryHistory, this.deliveryHistory);
    return allowed;
  }
}

const dedupeTargets = targets => {
  const rows = new Map();
  for (const target of targets || []) {
    const value = String(target || '').trim();
    const key = targetDedupKey(value);
    if (!key) continue;
    const current = rows.get(key);
    if (!current || preferTarget(value, current)) rows.set(key, value);
  }
  return [...rows.values()];
};

const targetDedupKey = target => {
  const parts = String(target || '').split(':');
  if (parts.length >= 3) return `${parts[1]}:${parts.slice(2).join(':')}`;
  if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
  return String(target || '');
};

const preferTarget = (next, current) => {
  const nextParts = String(next || '').split(':');
  const currentParts = String(current || '').split(':');
  return nextParts.length >= 3 && currentParts.length < 3;
};

const pruneDeliveryHistory = (history, now) => {
  let changed = false;
  for (const [eventKey, targets] of Object.entries(history)) {
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
      delete history[eventKey];
      changed = true;
      continue;
    }
    for (const [targetKey, claimedAt] of Object.entries(targets)) {
      if (!Number.isFinite(Number(claimedAt)) || now - Number(claimedAt) > DELIVERY_TTL_MS) {
        delete targets[targetKey];
        changed = true;
      }
    }
    if (!Object.keys(targets).length) {
      delete history[eventKey];
      changed = true;
    }
  }
  return changed;
};

const pruneHistorySize = history => {
  const entries = Object.entries(history);
  if (entries.length <= DELIVERY_HISTORY_LIMIT) return false;
  entries
    .sort(([, left], [, right]) => latestClaim(left) - latestClaim(right))
    .slice(0, entries.length - DELIVERY_HISTORY_LIMIT)
    .forEach(([eventKey]) => delete history[eventKey]);
  return true;
};

const latestClaim = targets => Math.max(...Object.values(targets).map(value => Number(value) || 0), 0);
