export const PLATFORMS = ['github', 'gitee', 'gitcode', 'gitea'];

export const PLATFORM_LABELS = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitcode: 'GitCode',
  gitea: 'Gitea'
};

export const normalizePlatform = value => {
  const platform = String(value || '').trim().toLowerCase();
  return PLATFORMS.includes(platform) ? platform : '';
};

export const getPlatformLabel = platform => PLATFORM_LABELS[platform] || platform;

export const normalizeInstanceUrl = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/g, '');
    return url.toString().replace(/\/+$/g, '');
  } catch {
    return '';
  }
};

export const urlMatchesBase = (value, base) => {
  try {
    const target = new URL(value);
    const baseUrl = new URL(base);
    if (target.origin !== baseUrl.origin) return false;
    const basePath = baseUrl.pathname.replace(/\/+$/g, '');
    return !basePath || target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
};

export const resolveInstanceAssetUrl = (value, instance) => {
  const text = String(value || '').trim();
  const base = normalizeInstanceUrl(instance);
  if (!text || !base) return text;
  try {
    const baseUrl = new URL(`${base}/`);
    const target = new URL(text, baseUrl);
    const basePath = baseUrl.pathname.replace(/\/+$/g, '');
    if (basePath && target.origin === baseUrl.origin
      && target.pathname !== basePath
      && !target.pathname.startsWith(`${basePath}/`)) {
      target.pathname = `${basePath}/${target.pathname.replace(/^\/+/g, '')}`;
    }
    return target.toString();
  } catch {
    return text;
  }
};

export const normalizeRepoSlug = (slug, useLowercase = true) => {
  const value = String(slug || '').trim().replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) return '';
  return useLowercase ? value.toLowerCase() : value;
};

export const makeRepoKey = ref => {
  const platform = normalizePlatform(ref?.platform);
  const fullName = String(ref?.fullName || `${ref?.owner || ''}/${ref?.repo || ''}`).trim();
  const instanceUrl = platform === 'gitea' ? normalizeInstanceUrl(ref?.instance) : '';
  const instance = instanceUrl ? `${instanceUrl}:` : '';
  return `${platform}:${instance}${fullName}`;
};

export const makeRepoBranchKey = ref => {
  const key = makeRepoKey(ref);
  const branch = String(ref?.branch || '').trim();
  return branch ? `${key}:${branch}` : key;
};

export const makeRepoPushKey = (ref, sha) => {
  const repoKey = makeRepoKey(ref).toLowerCase();
  const commit = String(sha || '').trim().toLowerCase();
  return repoKey && commit ? `push:${repoKey}:${commit}` : '';
};

export const makeRepoEntityKey = (ref, type, number, version) => {
  const repoKey = makeRepoKey(ref).toLowerCase();
  const normalizedType = String(type || '').toLowerCase().includes('pull') || String(type || '').toLowerCase() === 'pr'
    ? 'pr'
    : 'issue';
  const entityNumber = String(number || '').trim();
  const entityVersion = normalizeEntityVersion(version);
  if (!repoKey || !entityNumber || !entityVersion) return '';
  return `entity:${repoKey}:${normalizedType}:${encodeURIComponent(entityNumber)}:${encodeURIComponent(entityVersion)}`;
};

const normalizeEntityVersion = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? text : String(timestamp);
};

export const splitFullName = fullName => {
  const [owner, repo] = String(fullName || '').split('/');
  return { owner: owner || '', repo: repo || '' };
};
