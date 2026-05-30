import crypto from 'node:crypto';
import express from 'express';
import { notifySubscribers } from './notifier.js';
import { makeRepoKey, normalizeRepoSlug, splitFullName } from './platform.js';
import { RepoStore } from './repoStore.js';

let server = null;

export const startWebhookService = config => {
  if (server || !config.webhook?.enabled) return;
  const app = express();
  const routePath = normalizePath(config.webhook.path || '/git/webhook');
  app.use(express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  app.get(routePath, (req, res) => res.status(200).send('git webhook ok'));
  app.post(routePath, async (req, res) => {
    try {
      if (!verifySecret(req, config.webhook.secret || '')) {
        res.status(401).send('invalid signature');
        return;
      }
      await dispatchWebhook(req, config);
      res.status(200).send('ok');
    } catch (err) {
      logger.error(`[Git-Plugin] Webhook 处理失败: ${err.stack || err.message}`);
      res.status(500).send('server error');
    }
  });

  server = app.listen(Number(config.webhook.port || 6192), config.webhook.host || '0.0.0.0', () => {
    logger.info(`[Git-Plugin] Webhook 服务已启动: ${config.webhook.host}:${config.webhook.port}${routePath}`);
  });
};

export const stopWebhookService = () => {
  if (!server) return;
  server.close();
  server = null;
};

const dispatchWebhook = async (req, config) => {
  const platform = detectPlatform(req);
  const ref = getWebhookRef(platform, req.body, config);
  if (!ref) return;
  const key = makeRepoKey(ref);
  const item = new RepoStore().findSubscription(key);
  if (!item) return;
  await notifySubscribers(item.subscribers, formatWebhookMessage(platform, key, req));
};

const detectPlatform = req => {
  const header = name => String(req.get(name) || '').toLowerCase();
  if (header('x-github-event')) return 'github';
  if (header('x-gitee-event')) return 'gitee';
  if (header('x-gitcode-event')) return 'gitcode';
  if (header('x-gitea-event')) return 'gitea';
  return String(req.query.platform || req.body?.platform || '').toLowerCase();
};

const getWebhookRef = (platform, payload, config) => {
  const repo = payload?.repository || payload?.project;
  const fullName = normalizeRepoSlug(repo?.full_name || repo?.path_with_namespace, config.useLowercaseRepo);
  if (!platform || !fullName) return null;
  const { owner, repo: repoName } = splitFullName(fullName);
  const instance = platform === 'gitea' ? resolveGiteaInstance(repo, config) : '';
  return { platform, instance, owner, repo: repoName, fullName };
};

const formatWebhookMessage = (platform, key, req) => {
  const event = req.get('x-github-event') || req.get('x-gitee-event') || req.get('x-gitcode-event') || req.get('x-gitea-event') || 'event';
  const action = req.body?.action ? ` ${req.body.action}` : '';
  const title = req.body?.issue?.title || req.body?.pull_request?.title || req.body?.head_commit?.message || '';
  const url = req.body?.issue?.html_url || req.body?.pull_request?.html_url || req.body?.repository?.html_url || req.body?.project?.web_url || '';
  return [`[Git Webhook] ${key}`, `平台: ${platform}`, `事件: ${event}${action}`, title ? `标题: ${title}` : '', url ? `链接: ${url}` : ''].filter(Boolean).join('\n');
};

const verifySecret = (req, secret) => {
  if (!secret) return true;
  const githubSig = req.get('x-hub-signature-256');
  if (githubSig) {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex')}`;
    if (Buffer.byteLength(githubSig) !== Buffer.byteLength(expected)) return false;
    return crypto.timingSafeEqual(Buffer.from(githubSig), Buffer.from(expected));
  }
  const token = req.get('x-gitee-token') || req.get('x-gitcode-token') || req.get('x-gitea-token') || req.query.secret;
  return token === secret;
};

const normalizePath = value => {
  const path = String(value || '/git/webhook').trim();
  return path.startsWith('/') ? path : `/${path}`;
};

const getOrigin = value => {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
};

const resolveGiteaInstance = (repo, config) => {
  const origin = getOrigin(repo?.html_url || repo?.website || repo?.clone_url || repo?.ssh_url);
  if (origin) return origin;
  const instances = config.providers?.gitea?.instances || {};
  const baseUrls = Object.values(instances).map(item => String(item?.baseUrl || '').replace(/\/+$/g, '')).filter(Boolean);
  return baseUrls.length === 1 ? baseUrls[0] : '';
};
