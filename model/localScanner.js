import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const IGNORE_DIRS = new Set(['data', 'node_modules', 'temp', 'logs', 'cache', 'dist', '.git', '.github', '.vscode'])

const URL_PATTERNS = [
  { pattern: /github\.com[:/](?<repo>[^/]+\/[^/.?#]+)/i, platform: 'github' },
  { pattern: /gitee\.com[:/](?<repo>[^/]+\/[^/.?#]+)/i, platform: 'gitee' },
  { pattern: /gitcode\.com[:/](?<repo>[^/]+\/[^/.?#]+)/i, platform: 'gitcode' },
]

async function isGitRepo(dir) {
  try {
    await fs.promises.access(path.join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

async function gitExec(dir, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: dir, timeout: 5000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

async function getRemoteUrl(dir) {
  // Try: git remote get-url origin
  let url = await gitExec(dir, ['remote', 'get-url', 'origin'])
  if (url) return url

  // Fallback: parse git remote -v
  const remoteV = await gitExec(dir, ['remote', '-v'])
  const match = remoteV.match(/^origin\s+(\S+)/m)
  return match ? match[1] : ''
}

async function getCurrentBranch(dir) {
  let branch = await gitExec(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch || branch === 'HEAD') {
    branch = await gitExec(dir, ['branch', '--show-current'])
  }
  return branch || 'main'
}

async function getHeadSha(dir) {
  return gitExec(dir, ['rev-parse', 'HEAD'])
}

async function getUpstreamBranch(dir) {
  return gitExec(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
}

async function hasGitDiff(dir, args = []) {
  try {
    await execFileAsync('git', ['diff', ...args, '--quiet'], { cwd: dir, timeout: 5000 })
    return false
  } catch (err) {
    return err?.code === 1
  }
}

async function hasLocalDiff(dir) {
  const [worktree, staged] = await Promise.all([
    hasGitDiff(dir),
    hasGitDiff(dir, ['--cached'])
  ])
  return worktree || staged
}

function classifyRemote(remoteUrl) {
  for (const { pattern, platform } of URL_PATTERNS) {
    const match = remoteUrl.match(pattern)
    if (match?.groups?.repo) {
      return { platform, fullName: match.groups.repo.replace(/\.git$/, '') }
    }
  }

  // Try generic SSH/HTTPS pattern for unknown hosts (treat as Gitea)
  const sshMatch = remoteUrl.match(/[:/](?<host>[^/:]+[:/])(?<repo>[^/]+\/[^/.?#]+)/)
  if (sshMatch?.groups) {
    const host = sshMatch.groups.host.replace(/[:/]$/, '')
    const repo = sshMatch.groups.repo.replace(/\.git$/, '')
    if (host && repo) {
      return { platform: 'gitea', fullName: repo, instance: `https://${host}` }
    }
  }

  return null
}

async function scanDir(dir, results) {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  if (await isGitRepo(dir)) {
    const [remoteUrl, branch, headSha, upstream, hasDiff] = await Promise.all([
      getRemoteUrl(dir),
      getCurrentBranch(dir),
      getHeadSha(dir),
      getUpstreamBranch(dir),
      hasLocalDiff(dir)
    ])
    if (remoteUrl) {
      const classified = classifyRemote(remoteUrl)
      if (classified) {
        results.push({ ...classified, branch, headSha, upstream, hasDiff, canUpdate: Boolean(upstream), dir })
      }
    }
    return // Don't recurse into git repos
  }

  // Recurse into subdirectories
  const subdirs = entries.filter(e => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
  for (const entry of subdirs) {
    await scanDir(path.join(dir, entry.name), results)
  }
}

export async function scanLocalRepos(rootDir) {
  const results = []
  const scanRoot = rootDir || path.join(process.cwd(), 'plugins')
  logger.info(`[Git-Plugin] 开始扫描本地仓库: ${scanRoot}`)
  await scanDir(scanRoot, results)
  logger.info(`[Git-Plugin] 扫描完成，发现 ${results.length} 个仓库`)
  for (const repo of results) {
    logger.debug(`[Git-Plugin]   ${repo.platform}:${repo.fullName} (${repo.branch}) @ ${repo.dir}`)
  }
  return results
}
