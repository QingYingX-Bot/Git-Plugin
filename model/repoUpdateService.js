import { createProvider } from './providers/index.js'
import { RepoStore } from './repoStore.js'
import { makeRepoKey } from './platform.js'
import { scanLocalRepos } from './localScanner.js'
import { notifySubscribers } from './notifier.js'
import { getGitConfig } from '../components/config.js'
import { renderRepoUpdateCard } from './repoUpdateRenderer.js'

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
        const commits = await provider.listCommits(ref, { perPage: 1 })
        if (!commits?.length) continue

        const latest = commits[0]
        const sha = latest.sha || ''
        if (!sha) continue

        const lastSha = store.getLastSha(key)
        if (lastSha === sha) continue

        // Update detected (or first time)
        store.setLastSha(key, sha)
        if (lastSha) {
          // Only push if we had a previous SHA (skip first-time to avoid dumping history)
          updates.set(key, {
            ref,
            sha: sha.slice(0, 7),
            message: latest.message || latest.title || '',
            author: latest.author || '',
            url: latest.webUrl || ''
          })
        }
      } catch (err) {
        logger.warn(`[Git-Plugin] 检查 ${key} 更新失败: ${err.message}`)
      }
    }

    if (!updates.size) return

    // Push updates to configured targets per list entry
    for (const entry of list) {
      const targets = []
      for (const g of (entry.groups || [])) {
        const raw = String(g || '').trim()
        if (!raw) continue
        // Support "bot_id:group_hash" format — preserve bot_id prefix
        // e.g. "icqq:123456" -> "group:icqq:123456", "123456" -> "group:123456"
        const parts = raw.split(':')
        if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
          // Has bot_id prefix
          targets.push(`group:${raw}`)
        } else {
          // Plain group id
          const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
          if (id) targets.push(`group:${id}`)
        }
      }
      for (const f of (entry.friends || [])) {
        const raw = String(f || '').trim()
        if (!raw) continue
        // Support "bot_id:user_id" format — preserve bot_id prefix
        const parts = raw.split(':')
        if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
          targets.push(`private:${raw}`)
        } else {
          const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
          if (id) targets.push(`private:${id}`)
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

      // Try to render each update as a card image
      for (const update of entryUpdates) {
        const img = await renderRepoUpdateCard(update).catch(() => false)
        if (img) {
          await notifySubscribers(targets, img)
        } else {
          // Fallback to plain text
          await notifySubscribers(targets, formatSingleUpdate(update))
        }
        // Card is an image — send link separately so it's clickable
        if (img && update.url) {
          await notifySubscribers(targets, update.url).catch(() => {})
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

function formatSingleUpdate(u) {
  return [
    `[Git 仓库更新] ${u.ref.platform}:${u.ref.fullName}`,
    u.message ? `  ${String(u.message).split('\n')[0].trim()}` : '',
    u.author ? `  👤 ${u.author}` : '',
    u.url ? `  🔗 ${u.url}` : ''
  ].filter(Boolean).join('\n')
}
