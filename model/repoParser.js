import {
  normalizeInstanceUrl,
  normalizePlatform,
  normalizeRepoSlug,
  splitFullName,
  urlMatchesBase
} from './platform.js';

const PLATFORM_HOSTS = {
  github: ['github.com'],
  gitee: ['gitee.com'],
  gitcode: ['gitcode.com']
};

export const stripCommand = (message, names) => {
  const command = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return String(message || '').replace(new RegExp(`^\\s*[#/!！]?\\s*(?:${command})\\b`, 'i'), '').trim();
};

export const getOriginId = e => {
  const botId = String(e?.self_id || '').trim();
  const prefix = botId ? `${botId}:` : '';
  if (e?.group_id) return `${prefix}group:${e.group_id}`;
  if (e?.user_id) return `${prefix}private:${e.user_id}`;
  return String(e?.unified_msg_origin || 'unknown');
};

export const parseRepoUrl = (value, config = {}) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const platform = Object.entries(PLATFORM_HOSTS).find(([, hosts]) => hosts.includes(host))?.[0];
  const giteaInstance = findGiteaInstance(url, config);
  const currentPlatform = platform || (giteaInstance ? 'gitea' : '');
  if (!currentPlatform) return null;

  const parts = getRepoPathParts(url, giteaInstance);
  if (parts.length < 2) return null;
  return buildRef(currentPlatform, parts.slice(0, 2).join('/'), {
    config,
    instance: giteaInstance?.baseUrl || ''
  });
};

export const parseRepoTarget = (input, options = {}) => {
  const config = options.config || {};
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const urlRef = parseRepoUrl(trimmed.split(/\s+/)[0], config);
  if (urlRef) return urlRef;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  let platform = normalizePlatform(parts[0]) || options.defaultPlatform || config.defaultPlatform || 'github';
  if (normalizePlatform(parts[0])) parts.shift();

  let instance = '';
  if (platform === 'gitea') {
    if (/^https?:\/\//i.test(parts[0] || '')) {
      instance = parts.shift().replace(/\/+$/g, '');
    } else {
      instance = getDefaultGiteaInstance(config);
    }
  }

  return buildRef(platform, parts[0], { config, instance });
};

export const parseNumberTarget = (input, options = {}) => {
  const trimmed = String(input || '').trim();
  const urlTarget = parseNumberUrl(trimmed, options);
  if (urlTarget) return urlTarget;

  if (/^[\w.-]+$/.test(trimmed)) {
    return options.defaultRef ? { ref: options.defaultRef, number: trimmed } : null;
  }

  const hashMatch = trimmed.match(/(.+?)(?:#|\s+)([\w.-]+)$/);
  if (!hashMatch) return null;
  const ref = parseRepoTarget(hashMatch[1], options);
  return ref ? { ref, number: hashMatch[2] } : null;
};

const parseNumberUrl = (value, options = {}) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const markerIndex = parts.findIndex(part => ['issues', 'pull', 'pulls'].includes(part));
  if (parts.length < 4 || markerIndex < 2 || !/^[\w.-]+$/.test(parts[markerIndex + 1] || '')) return null;
  const repoUrl = new URL(url.origin);
  repoUrl.pathname = `/${parts.slice(0, markerIndex).join('/')}`;
  const ref = parseRepoUrl(repoUrl, options.config || {});
  return ref ? { ref, number: parts[markerIndex + 1] } : null;
};

const buildRef = (platform, slug, options = {}) => {
  const normalizedPlatform = normalizePlatform(platform);
  const fullName = normalizeRepoSlug(slug, options.config?.useLowercaseRepo);
  if (!normalizedPlatform || !fullName) return null;
  const { owner, repo } = splitFullName(fullName);
  return {
    platform: normalizedPlatform,
    instance: normalizedPlatform === 'gitea' ? normalizeInstanceUrl(options.instance) : '',
    owner,
    repo,
    fullName
  };
};

const getRepoPathParts = (url, instance) => {
  const parts = url.pathname.split('/').filter(Boolean);
  if (!instance?.baseUrl) return parts;

  try {
    const baseParts = new URL(instance.baseUrl).pathname.split('/').filter(Boolean);
    return parts.slice(0, baseParts.length).join('/') === baseParts.join('/')
      ? parts.slice(baseParts.length)
      : [];
  } catch {
    return parts;
  }
};

const findGiteaInstance = (url, config) => {
  const instances = config.providers?.gitea?.instances || {};
  return Object.values(instances)
    .filter(item => item?.baseUrl && urlMatchesBase(url, item.baseUrl))
    .sort((left, right) => {
      return getUrlPathLength(right.baseUrl) - getUrlPathLength(left.baseUrl);
    })[0];
};

const getDefaultGiteaInstance = config => {
  const instances = config.providers?.gitea?.instances || {};
  return Object.values(instances)
    .map(item => normalizeInstanceUrl(item?.baseUrl))
    .find(Boolean) || '';
};

const getUrlPathLength = value => {
  try {
    return new URL(value).pathname.length;
  } catch {
    return 0;
  }
};
