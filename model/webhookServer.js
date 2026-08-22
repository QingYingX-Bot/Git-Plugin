import crypto from 'node:crypto';
import express from 'express';
import { notifySubscribers } from './notifier.js';
import {
  getPlatformLabel,
  makeRepoEntityKey,
  makeRepoKey,
  makeRepoPushKey,
  normalizeInstanceUrl,
  normalizeRepoSlug,
  splitFullName,
  urlMatchesBase
} from './platform.js';
import { RepoStore } from './repoStore.js';
import { buildWebhookPushPayload } from './webhookPush.js';
import { maskAutoLink } from './formatters/link.js';
import { attachLocalPluginNames, buildWebhookPushButtons, targetsIncludeQQBot } from './qqBotButtons.js';

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
  if (!isAllowedWebhookEvent(req, config)) return;
  if (shouldSkipWebhook(req, config)) return;
  const ref = getWebhookRef(platform, req.body, config);
  if (!ref) return;
  const key = makeRepoKey(ref);
  const store = new RepoStore();
  const item = store.findSubscription(key);
  if (!item) return;
  const targets = store.claimDeliveryTargets(getWebhookDeliveryKey(platform, ref, req), item.subscribers);
  if (!targets.length) return;
  const { message, options } = await formatWebhookMessage(platform, ref, req, config, targets);
  await notifySubscribers(targets, message, options);
};

const detectPlatform = req => {
  const header = name => String(req.get(name) || '').toLowerCase();
  if (header('x-gitea-event') || header('x-gogs-event')) return 'gitea';
  if (header('x-gitee-event')) return 'gitee';
  if (header('x-gitcode-event')) return 'gitcode';
  if (header('x-github-event')) return 'github';
  return String(req.query.platform || req.body?.platform || '').toLowerCase();
};

const isAllowedWebhookEvent = (req, config) => {
  const allowed = normalizeAllowedTypes(config.webhook?.allowedEventTypes);
  return allowed.includes(getWebhookEventType(req));
};

const normalizeAllowedTypes = value => {
  const items = Array.isArray(value) ? value : ['issues', 'pull_requests', 'push'];
  return items.map(canonicalEventType).filter(Boolean);
};

const canonicalEventType = value => {
  const type = normalizeEventText(value).replace(/\s+/g, '_');
  if (['issue', 'issues'].includes(type)) return 'issues';
  if (['pr', 'pull_request', 'pull_requests', 'merge_request', 'merge_requests'].includes(type)) return 'pull_requests';
  if (['push', 'push_hook', 'push_events'].includes(type)) return 'push';
  return type;
};

const getWebhookEventType = req => {
  const event = normalizeEventText(getWebhookEvent(req));
  const object = req.body?.object_attributes || {};
  const objectText = normalizeEventText([
    req.body?.object_kind,
    req.body?.hook_name,
    object.noteable_type,
    object.target_type
  ].filter(Boolean).join(' '));

  if (req.body?.pull_request || req.body?.issue?.pull_request || event.includes('pull')
    || event.includes('merge request') || objectText.includes('merge request')) {
    return 'pull_requests';
  }
  if (req.body?.issue || event.includes('issue') || objectText.includes('issue')) return 'issues';
  if (event.includes('tag push') || objectText.includes('tag push')) return 'tag_push';
  if (event.includes('push') || objectText.includes('push') || (req.body?.ref && Array.isArray(req.body?.commits))) return 'push';
  return '';
};

const getWebhookEvent = req => {
  return req.get('x-gitea-event') || req.get('x-gogs-event') || req.get('x-gitee-event')
    || req.get('x-gitcode-event') || req.get('x-github-event') || 'event';
};

const normalizeEventText = value => String(value || '').toLowerCase().replace(/[_-]/g, ' ');

const shouldSkipWebhook = (req, config) => {
  if (config.webhook?.pushClosedEvents) return false;
  return getWebhookActionValues(req).some(value => ['closed', 'close'].includes(value));
};

const getWebhookAction = req => {
  return getWebhookActionValues(req)[0] || '';
};

const getWebhookActionValues = req => {
  const object = req.body?.object_attributes || {};
  return [req.body?.action, object.action, object.state]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
};

const getWebhookRef = (platform, payload, config) => {
  const repo = pickRepoPayload(payload, config);
  const displayName = resolveRepoFullName(repo, false);
  const fullName = normalizeRepoSlug(displayName, config.useLowercaseRepo);
  if (!platform || !fullName) return null;
  const { owner, repo: repoName } = splitFullName(fullName);
  const instance = platform === 'gitea' ? resolveGiteaInstance(repo, config) : '';
  return { platform, instance, owner, repo: repoName, fullName, displayName };
};

const getWebhookDeliveryKey = (platform, ref, req) => {
  const eventType = getWebhookEventType(req);
  if (eventType === 'push') {
    const after = getPushAfter(req.body);
    const pushKey = makeRepoPushKey(ref, after);
    if (pushKey) return pushKey;
  }

  const identity = getWebhookIdentity(req);
  const entityKey = makeRepoEntityKey(
    ref,
    eventType,
    identity.number,
    identity.version
  );
  if (entityKey) return entityKey;
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({
      platform,
      repo: makeRepoKey(ref).toLowerCase(),
      eventType,
      event: getWebhookEvent(req),
      identity: identity.fallback
    }))
    .digest('hex');
  return `webhook:${digest}`;
};

const getWebhookIdentity = req => {
  const object = req.body?.issue || req.body?.pull_request || req.body?.object_attributes || {};
  return {
    number: object.number || object.iid || object.id || '',
    version: object.updated_at || object.updatedAt || object.created_at || object.createdAt
      || req.body?.updated_at || req.body?.created_at || '',
    fallback: [
      object.url,
      object.html_url,
      object.title,
      object.state,
      req.body?.after,
      req.body?.checkout_sha
    ].map(value => String(value ?? '').trim()).filter(Boolean)
  };
};

const getPushAfter = payload => {
  const value = payload?.after || payload?.checkout_sha || payload?.object_attributes?.after
    || payload?.object_attributes?.checkout_sha || '';
  return /^0{7,40}$/.test(String(value || '').trim()) ? '' : value;
};

const formatWebhookMessage = async (platform, ref, req, config, subscribers = []) => {
  const key = ref.displayName || ref.fullName;
  if (getWebhookEventType(req) === 'push') {
    const { message, push } = await buildWebhookPushPayload(platform, key, req.body, getWebhookEvent(req));
    const branch = String(push.branch || '').trim();
    const buttonPush = { ...push, ref: branch ? { ...ref, branch } : ref };
    if (targetsIncludeQQBot(subscribers)) await attachLocalPluginNames([buttonPush], String(config.repoUpdate?.scanPath || '').trim() || undefined);
    return {
      message,
      options: { qqBotButtons: buildWebhookPushButtons(buttonPush, config) }
    };
  }

  const event = getWebhookEvent(req);
  const object = req.body?.object_attributes || {};
  const action = getWebhookAction(req);
  const actionText = action ? ` ${action}` : '';
  const title = req.body?.issue?.title || req.body?.pull_request?.title || object.title || req.body?.head_commit?.message || '';
  const url = req.body?.issue?.html_url || req.body?.pull_request?.html_url || object.url
    || req.body?.repository?.html_url || req.body?.repository?.homepage || req.body?.project?.web_url || '';
  const message = [
    `[${getPlatformLabel(platform)} ${formatEventName(event, getWebhookEventType(req))}] ${key}`,
    `事件: ${event}${actionText}`,
    title ? `标题: ${title}` : '',
    url ? `链接: ${maskAutoLink(url)}` : ''
  ].filter(Boolean).join('\n');
  return { message };
};

const formatEventName = (event, type = '') => {
  if (type === 'issues') return 'Issues';
  if (type === 'pull_requests') return 'Pull Request';
  const normalized = normalizeEventText(event);
  if (normalized.includes('issue') && (normalized.includes('comment') || normalized.includes('note'))) return 'Issue Comment';
  if (normalized.includes('pull') || normalized.includes('merge request')) return 'Pull Request';
  if (normalized.includes('issue')) return 'Issues';
  if (normalized.includes('push')) return 'Push';
  if (normalized.includes('release')) return 'Release';
  if (normalized.includes('star') || normalized.includes('watch')) return 'Star';
  return String(event || 'Event').replace(/\bhook\b/ig, '').trim().replace(/\b\w/g, char => char.toUpperCase()) || 'Event';
};

const verifySecret = (req, secret) => {
  if (!secret) return true;
  const prefixedSig = req.get('x-hub-signature-256') || req.get('x-gitcode-signature-256');
  if (prefixedSig && verifyHmac(req.rawBody, secret, prefixedSig, 'sha256=')) return true;

  const plainSig = req.get('x-gitea-signature') || req.get('x-gogs-signature');
  if (plainSig && verifyHmac(req.rawBody, secret, plainSig)) return true;

  const token = req.get('x-gitee-token') || req.get('x-gitcode-token') || req.get('x-gitlab-token')
    || req.get('x-gitea-token') || req.query.secret;
  return token === secret;
};

const verifyHmac = (rawBody, secret, signature, prefix = '') => {
  const expected = `${prefix}${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
  const actual = String(signature || '').trim();
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

const pickRepoPayload = (payload, config) => {
  const candidates = [payload?.repository, payload?.project, payload?.issue?.repository, payload?.pull_request?.base?.repo];
  return candidates.find(item => resolveRepoFullName(item, config.useLowercaseRepo)) || candidates.find(Boolean) || {};
};

const resolveRepoFullName = (repo, useLowercase = true) => {
  const direct = repo?.full_name || repo?.path_with_namespace;
  const fromNamespace = repo?.namespace && repo?.name ? `${repo.namespace}/${repo.name}` : '';
  return normalizeRepoSlug(direct || fromNamespace || slugFromUrl(repo), useLowercase);
};

const slugFromUrl = repo => {
  const value = repo?.html_url || repo?.web_url || repo?.homepage || repo?.git_http_url || repo?.http_url || repo?.url;
  try {
    const parts = new URL(value).pathname.replace(/\.git$/i, '').split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('/');
  } catch {
    const match = String(value || '').match(/:([^/:]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  }
  return '';
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
  const instances = config.providers?.gitea?.instances || {};
  const candidates = [
    repo?.html_url,
    repo?.web_url,
    repo?.git_http_url,
    repo?.http_url,
    repo?.clone_url,
    repo?.website,
    repo?.homepage,
    repo?.ssh_url
  ].map(value => String(value || '').trim()).filter(Boolean);
  const matching = Object.values(instances)
    .filter(item => item?.baseUrl && candidates.some(value => urlMatchesBase(value, item.baseUrl)))
    .sort((left, right) => {
      const leftPath = getUrlPathLength(left.baseUrl);
      const rightPath = getUrlPathLength(right.baseUrl);
      return rightPath - leftPath;
    });
  if (matching[0]?.baseUrl) return normalizeInstanceUrl(matching[0].baseUrl);

  const origin = candidates.map(getOrigin).find(Boolean);
  const baseUrls = Object.values(instances).map(item => normalizeInstanceUrl(item?.baseUrl)).filter(Boolean);
  const sameOrigin = baseUrls.filter(baseUrl => getOrigin(baseUrl) === origin);
  if (sameOrigin.length === 1) return sameOrigin[0];
  if (origin && !baseUrls.length) return normalizeInstanceUrl(origin);
  return baseUrls.length === 1 ? baseUrls[0] : '';
};

const getUrlPathLength = value => {
  try {
    return new URL(value).pathname.length;
  } catch {
    return 0;
  }
};
