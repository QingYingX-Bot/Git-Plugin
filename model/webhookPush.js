import { renderWebhookPushCard } from './webhookPushRenderer.js';
import { getPlatformLabel } from './platform.js';

export const buildWebhookPushMessage = async (platform, repo, payload = {}, event = 'push') => {
  const push = normalizeWebhookPush(platform, repo, payload, event);
  const img = await renderWebhookPushCard(push);
  if (img) return img;
  return formatWebhookPushText(push);
};

const normalizeWebhookPush = (platform, repo, payload, event) => {
  const commits = normalizeCommits(payload.commits || []);
  const branch = normalizeRef(payload.ref || payload.object_attributes?.ref || payload.object_attributes?.target_branch);
  const after = payload.after || payload.checkout_sha || payload.object_attributes?.after || payload.object_attributes?.checkout_sha || '';
  const deleted = isZeroSha(after) || Boolean(payload.deleted);
  const commitCount = Number(payload.total_commits_count ?? payload.total_commits ?? commits.length);
  return {
    platform,
    repo,
    event,
    branch,
    after,
    pusher: resolvePusher(payload),
    time: payload.head_commit?.timestamp || commits.at(-1)?.timestamp || payload.repository?.updated_at || '',
    title: deleted ? `删除分支 ${branch || 'unknown'}` : `推送 ${commitCount} 个提交到 ${branch || 'unknown'}`,
    commitCount,
    commits: commits.slice(-5).reverse(),
    url: payload.compare || payload.compare_url || payload.repository?.html_url || payload.project?.web_url || ''
  };
};

const normalizeCommits = commits => Array.isArray(commits)
  ? commits.map(commit => ({
    id: commit.id || commit.sha || '',
    message: commit.message || '',
    author: commit.author?.name || commit.author?.username || commit.author?.email || commit.committer?.name || '',
    timestamp: commit.timestamp || commit.authored_date || commit.committed_date || ''
  }))
  : [];

const resolvePusher = payload => {
  const values = [
    payload.pusher?.name,
    payload.pusher?.username,
    payload.user_name,
    payload.user?.name,
    payload.user?.username,
    payload.sender?.login,
    payload.sender?.username,
    payload.sender?.name
  ];
  return values.map(value => String(value || '').trim()).find(Boolean) || '';
};

const normalizeRef = value => String(value || '')
  .replace(/^refs\/heads\//, '')
  .replace(/^refs\/tags\//, '')
  .trim();

const isZeroSha = value => /^0{7,40}$/.test(String(value || ''));

const formatWebhookPushText = push => [
  `[${getPlatformLabel(push.platform)} Push] ${push.repo}`,
  `分支: ${push.branch || 'unknown'}`,
  `提交: ${push.commitCount}`,
  push.pusher ? `提交者: ${push.pusher}` : ''
].filter(Boolean).join('\n');
