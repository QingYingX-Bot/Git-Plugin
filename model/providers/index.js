import { GitHubProvider } from './githubProvider.js';
import { GiteeProvider } from './giteeProvider.js';
import { GitCodeProvider } from './gitcodeProvider.js';
import { GiteaProvider } from './giteaProvider.js';

const getGiteaConfig = (config, ref) => {
  const instances = config.providers?.gitea?.instances || {};
  const byUrl = Object.values(instances).find(item => {
    const baseUrl = String(item?.baseUrl || '').replace(/\/+$/g, '');
    return baseUrl && baseUrl === String(ref?.instance || '').replace(/\/+$/g, '');
  });
  return { ...(byUrl || {}), timeoutMs: config.requestTimeoutMs };
};

export const createProvider = (platform, config = {}, ref = {}, repoToken = '') => {
  const common = { timeoutMs: config.requestTimeoutMs };
  const token = repoToken ? { token: repoToken } : {};
  if (platform === 'github') return new GitHubProvider({ ...config.providers?.github, ...common, ...token });
  if (platform === 'gitee') return new GiteeProvider({ ...config.providers?.gitee, ...common, ...token });
  if (platform === 'gitcode') return new GitCodeProvider({ ...config.providers?.gitcode, ...common, ...token });
  if (platform === 'gitea') return new GiteaProvider({ ...getGiteaConfig(config, ref), ...token }, ref);
  throw new Error(`暂不支持平台: ${platform}`);
};
