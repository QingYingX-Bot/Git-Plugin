import { normalizePlatform, normalizeRepoSlug, splitFullName } from './platform.js';

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
  if (e?.group_id) return `group:${e.group_id}`;
  if (e?.user_id) return `private:${e.user_id}`;
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
  const giteaInstance = findGiteaInstance(url.origin, config);
  const currentPlatform = platform || (giteaInstance ? 'gitea' : '');
  if (!currentPlatform) return null;

  const parts = url.pathname.split('/').filter(Boolean);
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
  const repoUrl = `${url.origin}/${parts[0]}/${parts[1]}`;
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
    instance: options.instance || '',
    owner,
    repo,
    fullName
  };
};

const findGiteaInstance = (origin, config) => {
  const instances = config.providers?.gitea?.instances || {};
  return Object.values(instances).find(item => {
    const baseUrl = String(item?.baseUrl || '').replace(/\/+$/g, '');
    return baseUrl && baseUrl === origin.replace(/\/+$/g, '');
  });
};

const getDefaultGiteaInstance = config => {
  const instances = config.providers?.gitea?.instances || {};
  const first = Object.values(instances).find(item => item?.baseUrl);
  return first?.baseUrl?.replace(/\/+$/g, '') || '';
};
