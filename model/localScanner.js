import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeInstanceUrl } from './platform.js'

const execFileAsync = promisify(execFile)

const IGNORE_DIRS = new Set([
  'data', 'node_modules', 'temp', 'tmp', 'logs', 'cache', '.cache', 'dist', 'build',
  'out', 'target', 'coverage', 'venv', '.venv', '__pycache__',
  '.git', '.github', '.vscode', '.idea', '.svn', '.hg'
])

// 相对扫描根目录的最大递归层数：plugins/<插件> 是 1 层，
// 插件内部再套仓库（如 plugins/WeGame-plugin/modules/rocom）是 3 层。
const MAX_DEPTH = 4

// git 子进程并发上限。机器上 git 单次启动约 0.25s，放开跑会打满 CPU。
const GIT_CONCURRENCY = 4

const URL_PATTERNS = [
  { pattern: /github\.com[:/](?<repo>[^/]+\/[^/?#]+)/i, platform: 'github' },
  { pattern: /gitee\.com[:/](?<repo>[^/]+\/[^/?#]+)/i, platform: 'gitee' },
  { pattern: /gitcode\.com[:/](?<repo>[^/]+\/[^/?#]+)/i, platform: 'gitcode' },
]

function createLimiter(limit) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= limit || !queue.length) return
    active += 1
    const { task, resolve, reject } = queue.shift()
    task().then(resolve, reject).finally(() => {
      active -= 1
      next()
    })
  }
  return task => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject })
    next()
  })
}

const gitLimiter = createLimiter(GIT_CONCURRENCY)

async function gitExec(dir, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: dir, timeout: 5000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

/**
 * 定位 .git 目录。支持普通仓库（.git 是目录）与 worktree / 子模块（.git 是文件）。
 */
async function resolveGitDir(dir) {
  const dotGit = path.join(dir, '.git')
  let stat
  try {
    stat = await fs.promises.stat(dotGit)
  } catch {
    return ''
  }
  if (stat.isDirectory()) return dotGit

  try {
    const content = await fs.promises.readFile(dotGit, 'utf8')
    const match = content.match(/^gitdir:\s*(.+)$/m)
    if (!match) return ''
    return path.resolve(dir, match[1].trim())
  } catch {
    return ''
  }
}

/**
 * 解析 .git/config，取出 remote url 与分支上游配置。
 * 比 spawn `git remote get-url` / `git rev-parse @{u}` 快两个数量级。
 */
function parseGitConfig(text = '') {
  const remotes = {}
  const branches = {}
  let section = ''
  let name = ''

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue

    const header = line.match(/^\[([^\]]+)\]$/)
    if (header) {
      const parsed = header[1].match(/^([^\s"]+)(?:\s+"(.*)")?$/)
      section = parsed ? parsed[1].toLowerCase() : ''
      name = parsed?.[2] || ''
      continue
    }

    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].toLowerCase()
    const value = kv[2].trim()

    if (section === 'remote' && key === 'url') {
      remotes[name] = value
    } else if (section === 'branch') {
      const branch = branches[name] || (branches[name] = {})
      if (key === 'remote') branch.remote = value
      else if (key === 'merge') branch.merge = value
    }
  }

  return { remotes, branches }
}

/**
 * worktree 的 gitdir 里没有 config，引用也在公共目录下，由 commondir 指过去。
 */
async function resolveCommonDir(gitDir) {
  const raw = await fs.promises.readFile(path.join(gitDir, 'commondir'), 'utf8').catch(() => '')
  if (!raw.trim()) return gitDir
  return path.resolve(gitDir, raw.trim())
}

async function readGitConfigText(gitDir, commonDir) {
  const direct = await fs.promises.readFile(path.join(gitDir, 'config'), 'utf8').catch(() => '')
  if (direct) return direct
  if (commonDir === gitDir) return ''
  return fs.promises.readFile(path.join(commonDir, 'config'), 'utf8').catch(() => '')
}

async function readHeadRef(gitDir) {
  try {
    const head = (await fs.promises.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim()
    const ref = head.match(/^ref:\s*(.+)$/)
    if (!ref) return { branch: '', refPath: '', sha: head }
    const refPath = ref[1].trim()
    return { branch: refPath.replace(/^refs\/heads\//, ''), refPath, sha: '' }
  } catch {
    return { branch: '', refPath: '', sha: '' }
  }
}

async function readLooseRef(gitDir, refPath) {
  const sha = await fs.promises.readFile(path.join(gitDir, refPath), 'utf8').catch(() => '')
  return sha.trim()
}

async function readPackedRef(gitDir, refPath) {
  const packed = await fs.promises.readFile(path.join(gitDir, 'packed-refs'), 'utf8').catch(() => '')
  if (!packed) return ''
  const line = packed.split('\n').find(item => item.trim().endsWith(` ${refPath}`))
  return line ? line.trim().split(/\s+/)[0] : ''
}

async function readRefSha(gitDir, commonDir, refPath) {
  if (!refPath) return ''
  const dirs = commonDir === gitDir ? [gitDir] : [gitDir, commonDir]
  for (const base of dirs) {
    const loose = await readLooseRef(base, refPath)
    if (loose) return loose
  }
  for (const base of dirs) {
    const packed = await readPackedRef(base, refPath)
    if (packed) return packed
  }
  return ''
}

function buildUpstream(branch, branches = {}) {
  const info = branches[branch]
  if (!info?.remote || !info?.merge) return ''
  const merge = String(info.merge).replace(/^refs\/heads\//, '')
  return merge ? `${info.remote}/${merge}` : ''
}

async function readRepoGitInfo(dir) {
  const gitDir = await resolveGitDir(dir)
  if (!gitDir) return null

  const commonDir = await resolveCommonDir(gitDir)
  const [configText, head] = await Promise.all([
    readGitConfigText(gitDir, commonDir),
    readHeadRef(gitDir)
  ])

  const { remotes, branches } = parseGitConfig(configText)
  const headSha = head.sha || await readRefSha(gitDir, commonDir, head.refPath)

  return {
    remoteUrl: remotes.origin || '',
    branch: head.branch || 'main',
    headSha,
    upstream: buildUpstream(head.branch, branches)
  }
}

/**
 * 本地改动检测。原实现分别跑 `git diff` 与 `git diff --cached`，
 * 这里合并成一次 `git diff HEAD`，语义等价（工作区 + 暂存区相对 HEAD 的改动）。
 */
async function getLocalDiff(dir) {
  const summary = await gitLimiter(() => gitExec(dir, [
    '-c', 'core.fileMode=false', 'diff', 'HEAD', '--name-status', '--'
  ]))
  return { hasDiff: Boolean(summary), diffSummary: summary }
}

function classifyRemote(remoteUrl) {
  for (const { pattern, platform } of URL_PATTERNS) {
    const match = remoteUrl.match(pattern)
    if (match?.groups?.repo) {
      return { platform, fullName: match.groups.repo.replace(/\.git$/, '') }
    }
  }

  const httpRemote = parseHttpRemote(remoteUrl)
  if (httpRemote) return httpRemote

  const sshRemote = parseSshRemote(remoteUrl)
  if (sshRemote) return sshRemote

  return null
}

function parseHttpRemote(remoteUrl) {
  let url
  try {
    url = new URL(remoteUrl)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const fullName = parts.slice(-2).join('/').replace(/\.git$/i, '')
  const instancePath = parts.slice(0, -2).join('/')
  const instance = normalizeInstanceUrl(`${url.origin}${instancePath ? `/${instancePath}` : ''}`)
  return { platform: 'gitea', fullName, instance }
}

function parseSshRemote(remoteUrl) {
  let host = ''
  let remotePath = ''
  try {
    const url = new URL(remoteUrl)
    if (url.protocol !== 'ssh:') return null
    host = url.hostname
    remotePath = url.pathname
  } catch {
    const match = String(remoteUrl || '').match(/^(?:[^@]+@)?(?<host>[^:]+):(?<path>.+)$/)
    if (!match?.groups) return null
    host = match.groups.host
    remotePath = match.groups.path
  }
  const parts = String(remotePath || '').split('/').filter(Boolean)
  if (!host || parts.length < 2) return null
  const fullName = parts.slice(-2).join('/').replace(/\.git$/i, '')
  const instancePath = parts.slice(0, -2).join('/')
  const instance = normalizeInstanceUrl(`https://${host}${instancePath ? `/${instancePath}` : ''}`)
  return { platform: 'gitea', fullName, instance }
}

const scanCache = new Map()

function normalizeScanRoot(rootDir) {
  return path.resolve(rootDir || path.join(process.cwd(), 'plugins'))
}

function relativeName(rootDir, dir) {
  const rel = path.relative(rootDir, dir).split(path.sep).join('/')
  return rel || path.basename(dir)
}

async function scanDir(dir, results, depth, rootDir) {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  const tasks = []

  // readdir 已经给出名字，不必再为每个目录做一次 .git 探测
  if (entries.some(entry => entry.name === '.git')) {
    tasks.push((async () => {
      const info = await readRepoGitInfo(dir)
      if (!info?.remoteUrl) return

      const classified = classifyRemote(info.remoteUrl)
      if (!classified) return

      const localDiff = await getLocalDiff(dir)
      results.push({
        ...classified,
        // 相对扫描根的路径，供「更新插件」按钮拼 `#更新<插件>` 使用
        name: relativeName(rootDir, dir),
        branch: info.branch,
        headSha: info.headSha,
        upstream: info.upstream,
        hasDiff: localDiff.hasDiff,
        diffSummary: localDiff.diffSummary,
        canUpdate: Boolean(info.upstream),
        dir
      })
    })())
    // 不再 return：插件内部可能还嵌套独立仓库（如 WeGame-plugin/modules/rocom）
  }

  if (depth < MAX_DEPTH) {
    const subdirs = entries.filter(entry => (
      entry.isDirectory() && !IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')
    ))
    for (const entry of subdirs) {
      tasks.push(scanDir(path.join(dir, entry.name), results, depth + 1, rootDir))
    }
  }

  await Promise.all(tasks)
}

export async function scanLocalRepos(rootDir) {
  const results = []
  const scanRoot = normalizeScanRoot(rootDir)
  logger.info(`[Git-Plugin] 开始扫描本地仓库: ${scanRoot}`)
  const startedAt = Date.now()
  await scanDir(scanRoot, results, 0, scanRoot)
  logger.info(`[Git-Plugin] 扫描完成，发现 ${results.length} 个仓库，耗时 ${Date.now() - startedAt}ms`)
  for (const repo of results) {
    logger.debug(`[Git-Plugin]   ${repo.platform}:${repo.fullName} (${repo.branch}) @ ${repo.dir}`)
    if (repo.diffSummary) logger.debug(`[Git-Plugin]   本地改动:\n${repo.diffSummary}`)
  }
  return results
}

export function initLocalRepoScan(rootDir) {
  const scanRoot = normalizeScanRoot(rootDir)
  const cached = scanCache.get(scanRoot)
  if (cached) return cached.promise

  const entry = { results: [], done: false, promise: null }
  entry.promise = scanLocalRepos(scanRoot)
    .then(results => {
      entry.results = results
      entry.done = true
      return results
    })
    .catch(err => {
      scanCache.delete(scanRoot)
      throw err
    })
  scanCache.set(scanRoot, entry)
  return entry.promise
}

/**
 * 取本地仓库扫描结果。首次调用时才真正开扫（懒加载），
 * 避免把十几秒的扫描压进机器人框架的启动关键路径。
 */
export async function getScannedLocalRepos(rootDir) {
  const scanRoot = normalizeScanRoot(rootDir)
  const cached = scanCache.get(scanRoot)
  if (cached) return cached.done ? cached.results : cached.promise
  return initLocalRepoScan(scanRoot)
}
