import { createProvider } from './providers/index.js'
import { RepoStore } from './repoStore.js'
import { makeRepoBranchKey, makeRepoKey } from './platform.js'
import { getStartupScannedLocalRepos } from './localScanner.js'
import { notifySubscribers } from './notifier.js'
import { getGitConfig } from '../components/config.js'
import { renderRepoUpdateCard } from './repoUpdateRenderer.js'
import { collectRepoUpdateTargets } from './repoUpdateTargets.js'
import { maskAutoLink } from './formatters/link.js'
import { getCommitReleaseInfo } from './releaseInfo.js'
import { attachLocalPluginNames, buildRepoUpdateButtons, targetsIncludeQQBot } from './qqBotButtons.js'
import { collectChangedCommits, summarizeCommitActors, toUpdateCommit } from './repoUpdateCommits.js'

const HISTORY_PAGE_SIZE = 50
const HISTORY_MAX_PAGES = 1
const COMMIT_LIST_LIMIT = 8

let running = false

export async function runRepoUpdateCheck(config) {
  if (running) return
  running = true
  try {
    const repoUpdate = config.repoUpdate
    if (!repoUpdate?.enabled) return

    const list = Array.isArray(repoUpdate.list) ? repoUpdate.list : []
    if (!list.length) return

    // Collect all repos to check (manual + auto-scanned)
    const allRepos = new Map() // updateKey -> { ref, token, repoKey }

    for (const entry of list) {
      // Manual repos (with per-repo token)
      for (const repo of (entry.repos || [])) {
        const ref = buildRef(repo)
        if (!ref) continue
        const repoKey = makeRepoKey(ref)
        const key = makeRepoBranchKey(ref)
        const token = String(repo?.token || '').trim()
        if (!allRepos.has(key)) allRepos.set(key, { ref, token, repoKey })
      }

      // Auto-scanned repos
      if (entry.autoScan) {
        const scanPath = String(config.repoUpdate?.scanPath || '').trim() || undefined
        const scanned = await getStartupScannedLocalRepos(scanPath)
        for (const repo of scanned) {
          const ref = {
            platform: repo.platform,
            fullName: repo.fullName,
            owner: repo.fullName.split('/')[0],
            repo: repo.fullName.split('/')[1]
          }
          if (repo.instance) ref.instance = repo.instance
          if (repo.branch) ref.branch = repo.branch
          const repoKey = makeRepoKey(ref)
          const key = makeRepoBranchKey(ref)
          if (!allRepos.has(key)) allRepos.set(key, { ref, token: '', repoKey })
        }
      }
    }

    if (!allRepos.size) return

    const store = new RepoStore()

    // Load per-repo tokens from store (fallback for repos without inline token)
    for (const item of allRepos.values()) {
      if (!item.token) item.token = store.getRepoToken(item.repoKey)
    }

    // Check each repo for updates
    const updates = new Map() // key -> { ref, sha, message, url, author }

    for (const [key, { ref, token }] of allRepos) {
      try {
        const provider = createProvider(ref.platform, config, ref, token)
        const lastSha = store.getLastSha(key)
        const commits = await listRecentCommits(provider, ref, lastSha)
        if (!commits?.length) continue

        const latest = commits[0]
        const sha = latest.sha || ''
        if (!sha) continue

        const hashes = commits.map(item => item.sha).filter(Boolean)
        if (sameSha(lastSha, sha)) {
          store.setShaHistory(key, hashes)
          continue
        }

        const oldHistory = store.getShaHistory(key)
        const lastInCurrent = commits.some(item => sameSha(item.sha, lastSha))
        const rollbackTarget = lastInCurrent ? '' : findCommonSha(commits, oldHistory)
        const rollbackOnly = Boolean(rollbackTarget && sameSha(rollbackTarget, sha))
        store.setLastSha(key, sha)
        store.setShaHistory(key, hashes)
        if (!lastSha) continue

        if (rollbackOnly) {
          const pending = store.getPendingRewrite(key)
          store.setPendingRewrite(key, {
            fromSha: pending?.fromSha || shortSha(lastSha),
            toSha: shortSha(rollbackTarget),
            time: new Date().toISOString()
          })
          continue
        }

        const pendingRewrite = store.getPendingRewrite(key)
        const rewrite = pendingRewrite || (rollbackTarget ? {
          fromSha: shortSha(lastSha),
          toSha: shortSha(rollbackTarget),
          time: new Date().toISOString()
        } : null)
        const changedCommits = collectChangedCommits(commits, lastSha, rollbackTarget)
        const updateCommits = changedCommits.length ? changedCommits : [latest]
        const commitActors = summarizeCommitActors(updateCommits)
        const [commitDetails, releaseInfo] = await Promise.all([
          getCommitDetailsSummary(provider, ref, updateCommits).catch(() => ({})),
          getCommitReleaseInfo(provider, ref, sha).catch(() => null)
        ])

        updates.set(key, {
          ref,
          sha: shortSha(sha),
          fullSha: sha,
          previousSha: lastSha,
          message: latest.message || latest.title || '',
          author: commitActors.text || latest.author || '',
          authorAvatar: commitActors.avatar || latest.authorAvatar || '',
          time: latest.committedAt || latest.createdAt || '',
          url: latest.webUrl || '',
          commitCount: updateCommits.length,
          commits: updateCommits.slice(0, COMMIT_LIST_LIMIT).map(toUpdateCommit),
          filesChanged: commitDetails.filesChanged || 0,
          additions: commitDetails.additions || 0,
          deletions: commitDetails.deletions || 0,
          releaseInfo,
          rewrite: rewrite ? { ...rewrite, updateSha: shortSha(sha) } : null
        })
        if (pendingRewrite) store.clearPendingRewrite(key)
      } catch (err) {
        logger.warn(`[Git-Plugin] 检查 ${key} 更新失败: ${err.message}`)
      }
    }

    if (!updates.size) return
    const pushRows = collectRepoUpdateTargets(list, updates, buildRef)
    if (!pushRows.length) return

    const allTargets = pushRows.flatMap(row => row.targets)
    if (targetsIncludeQQBot(allTargets)) await attachLocalPluginNames(updates, String(config.repoUpdate?.scanPath || '').trim() || undefined)

    // Render once per update, then send the same message to all deduped targets.
    for (const { key, update, targets } of pushRows) {
      const pushOptions = { qqBotButtons: buildRepoUpdateButtons(update, config) }
      const img = await renderRepoUpdateCard(update).catch(() => false)
      const message = img || formatSingleUpdate(update)
      logger.debug(`[Git-Plugin] 推送 ${key} 到 ${targets.length} 个目标`)
      await notifySubscribers(targets, message, pushOptions)
    }

    logger.info(`[Git-Plugin] 仓库更新检测完成，${updates.size} 个仓库有更新`)
  } catch (err) {
    logger.error(`[Git-Plugin] 仓库更新检测失败: ${err.stack || err.message}`)
  } finally {
    running = false
  }
}

function buildRef(repo) {
  const platform = String(repo?.platform || '').trim()
  const fullName = String(repo?.repo || '').trim()
  if (!platform || !fullName || !/^[^/]+\/[^/]+$/.test(fullName)) return null
  const [owner, repoName] = fullName.split('/')
  const ref = { platform, fullName, owner, repo: repoName }
  const branch = String(repo?.branch || '').trim()
  if (branch) ref.branch = branch
  return ref
}

async function listRecentCommits(provider, ref, stopSha = '') {
  const result = []
  for (let page = 1; page <= HISTORY_MAX_PAGES; page += 1) {
    const rows = await provider.listCommits(ref, { perPage: HISTORY_PAGE_SIZE, page })
    const commits = Array.isArray(rows) ? rows.filter(item => item?.sha) : []
    result.push(...commits)
    if (stopSha && commits.some(item => sameSha(item.sha, stopSha))) break
    if (commits.length < HISTORY_PAGE_SIZE) break
  }
  return result
}

function sameSha(left = '', right = '') {
  const a = String(left || '').trim().toLowerCase()
  const b = String(right || '').trim().toLowerCase()
  if (!a || !b) return false
  return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b))
}

function findCommonSha(commits = [], history = []) {
  const found = commits.find(item => history.some(sha => sameSha(sha, item.sha)))
  return found?.sha || ''
}

function shortSha(value = '') {
  return String(value || '').trim().slice(0, 7)
}

async function getCommitDetailsSummary(provider, ref, commits = []) {
  const rows = await Promise.all(commits.map(item => getCommitDetails(provider, ref, item.sha).catch(() => ({}))))
  return rows.reduce((total, item) => ({
    filesChanged: total.filesChanged + Number(item.filesChanged || 0),
    additions: total.additions + Number(item.additions || 0),
    deletions: total.deletions + Number(item.deletions || 0)
  }), { filesChanged: 0, additions: 0, deletions: 0 })
}

async function getCommitDetails(provider, ref, sha) {
  try {
    // GitHub API: GET /repos/{owner}/{repo}/commits/{sha}
    const data = await provider.get(`/repos/${provider.repoPath(ref)}/commits/${sha}`)
    const stats = data.stats || {}
    const files = data.files || []
    return {
      filesChanged: files.length,
      additions: stats.additions || 0,
      deletions: stats.deletions || 0
    }
  } catch {
    return { filesChanged: 0, additions: 0, deletions: 0 }
  }
}

function formatSingleUpdate(u) {
  const lines = [
    `[Git 仓库更新] ${u.ref.platform}:${u.ref.fullName}`,
    u.ref.branch ? `  分支 ${u.ref.branch}` : '',
    u.rewrite ? `  回退 ${u.rewrite.fromSha}${u.rewrite.toSha ? ` -> ${u.rewrite.toSha}` : ' 已离开当前分支'}` : '',
    u.rewrite ? `  更新 ${u.rewrite.updateSha}` : '',
    u.releaseInfo ? `  ${u.releaseInfo.type === 'release' ? 'Release' : 'Tag'} ${u.releaseInfo.tag}${u.releaseInfo.title ? ` ${u.releaseInfo.title}` : ''}` : '',
    u.commitCount > 1 ? `  ${u.commitCount} 个提交` : '',
    ...(u.commits?.length > 1 ? u.commits.map(item => `  - ${item.sha} ${item.title}${item.actor ? ` (${item.actor})` : ''}`) : [u.message ? `  ${String(u.message).split('\n')[0].trim()}` : '']),
    u.author ? `  👤 ${u.author}` : '',
    u.url ? `  🔗 ${maskAutoLink(u.url)}` : ''
  ]
  return lines.filter(Boolean).join('\n')
}
