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

export const normalizeRepoSlug = (slug, useLowercase = true) => {
  const value = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) return '';
  return useLowercase ? value.toLowerCase() : value;
};

export const makeRepoKey = ref => {
  const platform = normalizePlatform(ref?.platform);
  const fullName = String(ref?.fullName || `${ref?.owner || ''}/${ref?.repo || ''}`).trim();
  const instance = platform === 'gitea' && ref?.instance ? `${ref.instance}:` : '';
  return `${platform}:${instance}${fullName}`;
};

export const makeRepoBranchKey = ref => {
  const key = makeRepoKey(ref);
  const branch = String(ref?.branch || '').trim();
  return branch ? `${key}:${branch}` : key;
};

export const splitFullName = fullName => {
  const [owner, repo] = String(fullName || '').split('/');
  return { owner: owner || '', repo: repo || '' };
};
