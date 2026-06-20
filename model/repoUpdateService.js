import path from 'node:path'
import { createProvider } from './providers/index.js'
import { RepoStore } from './repoStore.js'
import { makeRepoKey } from './platform.js'
import { scanLocalRepos } from './localScanner.js'
import { notifySubscribers } from './notifier.js'
import { getGitConfig } from '../components/config.js'
import { renderRepoUpdateCard } from './repoUpdateRenderer.js'
import { maskAutoLink } from './formatters/link.js'
import { getCommitReleaseInfo } from './releaseInfo.js'

const HISTORY_PAGE_SIZE = 50
const HISTORY_MAX_PAGES = 1

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
    const allRepos = new Map() // key -> { ref, token }

    for (const entry of list) {
      // Manual repos (with per-repo token)
      for (const repo of (entry.repos || [])) {
        const ref = buildRef(repo)
        if (!ref) continue
        const key = makeRepoKey(ref)
        const token = String(repo?.token || '').trim()
        if (!allRepos.has(key)) allRepos.set(key, { ref, token })
      }

      // Auto-scanned repos
      if (entry.autoScan) {
        const scanPath = String(config.repoUpdate?.scanPath || '').trim() || undefined
        const scanned = await scanLocalRepos(scanPath)
        for (const repo of scanned) {
          const ref = {
            platform: repo.platform,
            fullName: repo.fullName,
            owner: repo.fullName.split('/')[0],
            repo: repo.fullName.split('/')[1]
          }
          if (repo.instance) ref.instance = repo.instance
          const key = makeRepoKey(ref)
          if (!allRepos.has(key)) allRepos.set(key, { ref, token: '' })
        }
      }
    }

    if (!allRepos.size) return

    const store = new RepoStore()

    // Load per-repo tokens from store (fallback for repos without inline token)
    for (const [key, item] of allRepos) {
      if (!item.token) item.token = store.getRepoToken(key)
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
        const [commitDetails, releaseInfo] = await Promise.all([
          getCommitDetails(provider, ref, sha).catch(() => ({})),
          getCommitReleaseInfo(provider, ref, sha).catch(() => null)
        ])

        updates.set(key, {
          ref,
          sha: shortSha(sha),
          message: latest.message || latest.title || '',
          author: latest.author || '',
          authorAvatar: latest.authorAvatar || '',
          url: latest.webUrl || '',
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
    let localPluginNamesAttached = false

    // Push updates to configured targets per list entry
    for (const entry of list) {
      const targets = []
      for (const g of (entry.groups || [])) {
        const raw = String(g || '').trim()
        if (!raw) continue
        // Support "bot_id:group_hash" format — convert to "bot_id:group:group_hash"
        // e.g. "3889750061:FB20E66229B4C2956BC8E2347CB557F5" -> "3889750061:group:FB20E66229B4C2956BC8E2347CB557F5"
        // "FB20E66229B4C2956BC8E2347CB557F5" -> "group:FB20E66229B4C2956BC8E2347CB557F5"
        const parts = raw.split(':')
        if (parts.length >= 2) {
          // Has bot_id prefix: "bot_id:group_hash" -> "bot_id:group:group_hash"
          targets.push(`${parts[0]}:group:${parts.slice(1).join(':')}`)
        } else {
          // Plain group id: "group_hash" -> "group:group_hash"
          targets.push(`group:${raw}`)
        }
      }
      for (const f of (entry.friends || [])) {
        const raw = String(f || '').trim()
        if (!raw) continue
        // Support "bot_id:user_id" format — convert to "bot_id:private:user_id"
        const parts = raw.split(':')
        if (parts.length >= 2) {
          // Has bot_id prefix: "bot_id:user_id" -> "bot_id:private:user_id"
          targets.push(`${parts[0]}:private:${parts.slice(1).join(':')}`)
        } else {
          // Plain user id: "user_id" -> "private:user_id"
          targets.push(`private:${raw}`)
        }
      }
      if (!targets.length) continue

      // Build exclude set for this entry
      const excludeSet = new Set((entry.exclude || []).map(s => String(s || '').trim()))

      // Collect matching updates
      const entryUpdates = []
      for (const [key, update] of updates) {
        const ref = update.ref
        const excludeKey = ref.branch ? `${ref.fullName}:${ref.branch}` : ref.fullName
        if (excludeSet.has(excludeKey)) continue

        // If this entry has repos defined, only include repos that match
        if (entry.repos?.length) {
          const entryKeys = new Set(entry.repos.map(r => makeRepoKey(buildRef(r))).filter(Boolean))
          if (!entryKeys.has(key) && !entry.autoScan) continue
        }

        entryUpdates.push(update)
      }

      if (!entryUpdates.length) continue
      if (!localPluginNamesAttached && targetsIncludeQQBot(targets)) {
        await attachLocalPluginNames(updates)
        localPluginNamesAttached = true
      }

      // Try to render each update as a card image
      for (const update of entryUpdates) {
        const pushOptions = { qqBotButtons: buildRepoUpdateButtons(update, config) }
        const img = await renderRepoUpdateCard(update).catch(() => false)
        if (img) {
          await notifySubscribers(targets, img, pushOptions)
        } else {
          // Fallback to plain text
          await notifySubscribers(targets, formatSingleUpdate(update), pushOptions)
        }
      }
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
  return [
    `[Git 仓库更新] ${u.ref.platform}:${u.ref.fullName}`,
    u.rewrite ? `  回退 ${u.rewrite.fromSha}${u.rewrite.toSha ? ` -> ${u.rewrite.toSha}` : ' 已离开当前分支'}` : '',
    u.rewrite ? `  更新 ${u.rewrite.updateSha}` : '',
    u.releaseInfo ? `  ${u.releaseInfo.type === 'release' ? 'Release' : 'Tag'} ${u.releaseInfo.tag}${u.releaseInfo.title ? ` ${u.releaseInfo.title}` : ''}` : '',
    u.message ? `  ${String(u.message).split('\n')[0].trim()}` : '',
    u.author ? `  👤 ${u.author}` : '',
    u.url ? `  🔗 ${maskAutoLink(u.url)}` : ''
  ].filter(Boolean).join('\n')
}

function buildRepoUpdateButtons(update, config) {
  const linkRow = []
  if (update.url) {
    linkRow.push({ text: '查看提交', link: update.url, style: 1 })
  }

  const repoUrl = buildRepoWebUrl(update.ref, config)
  if (repoUrl && repoUrl !== update.url) {
    linkRow.push({ text: '打开仓库', link: repoUrl, style: 2 })
  }

  const releaseUrl = String(update.releaseInfo?.url || '').trim()
  if (releaseUrl && releaseUrl !== update.url && releaseUrl !== repoUrl) {
    linkRow.push({ text: '查看版本', link: releaseUrl, style: 2 })
  }

  const actionRow = []
  if (update.localPluginName) {
    actionRow.push({
      text: '更新插件',
      input: `#静更新${update.localPluginName}`,
      send: true,
      style: 4
    })
  }

  return [linkRow, actionRow].filter(row => row.length)
}

function buildRepoWebUrl(ref = {}, config = {}) {
  const fullName = String(ref.fullName || '').trim().replace(/^\/+|\/+$/g, '')
  if (!fullName) return ''

  const platform = String(ref.platform || '').trim()
  const defaults = {
    github: 'https://github.com',
    gitee: 'https://gitee.com',
    gitcode: 'https://gitcode.com'
  }
  const base = platform === 'gitea'
    ? String(ref.instance || config.providers?.gitea?.instances?.default?.baseUrl || '').trim()
    : String(config.providers?.[platform]?.webBase || defaults[platform] || '').trim()

  return base ? `${base.replace(/\/+$/g, '')}/${fullName}` : ''
}

async function attachLocalPluginNames(updates) {
  const localRepos = await scanLocalRepos(path.join(process.cwd(), 'plugins')).catch(err => {
    logger.warn(`[Git-Plugin] 扫描本地插件仓库失败: ${err.message}`)
    return []
  })
  if (!localRepos.length) return

  const localPluginMap = new Map()
  for (const repo of localRepos) {
    const pluginName = path.basename(repo.dir || '')
    const key = repoLookupKey(repo)
    if (pluginName && key) localPluginMap.set(key, pluginName)
  }

  for (const update of updates.values()) {
    update.localPluginName = localPluginMap.get(repoLookupKey(update.ref)) || ''
  }
}

function repoLookupKey(ref) {
  return makeRepoKey(ref).toLowerCase()
}

function targetsIncludeQQBot(targets = []) {
  return targets.some(origin => {
    const botId = String(origin || '').split(':')[0]
    const bot = botId && Bot?.[botId]
    return bot?.version?.id === 'QQBot' || bot?.adapter?.id === 'QQBot' || bot?.adapter?.name === 'QQBot'
  })
}
