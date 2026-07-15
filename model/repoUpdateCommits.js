export function collectChangedCommits(commits = [], lastSha = '', stopSha = '') {
  const rows = Array.isArray(commits) ? commits.filter(item => item?.sha) : []
  const stop = stopSha || lastSha
  if (!stop) return []
  const index = rows.findIndex(item => sameSha(item.sha, stop))
  return index >= 0 ? rows.slice(0, index) : rows
}

export function summarizeCommitActors(commits = []) {
  const users = []
  const seen = new Set()
  for (const commit of commits) {
    addCommitUser(users, seen, commit?.author, commit?.authorAvatar)
    addCommitUser(users, seen, commit?.committer, commit?.committerAvatar)
  }

  const names = users.map(item => item.name)
  return {
    text: names.length > 3 ? `${names.slice(0, 3).join('、')} 等 ${names.length} 人` : names.join('、'),
    avatar: users[0]?.avatar || ''
  }
}

export function toUpdateCommit(commit = {}) {
  const message = commit.message || commit.title || ''
  return {
    sha: shortSha(commit.sha),
    title: String(message).split('\n')[0].trim() || '新提交',
    author: commit.author || '',
    committer: commit.committer || '',
    actor: formatCommitActor(commit),
    time: commit.committedAt || commit.createdAt || '',
    url: commit.webUrl || ''
  }
}

function addCommitUser(users, seen, name, avatar = '') {
  const value = String(name || '').trim()
  if (!value || value === 'unknown') return
  const key = value.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  users.push({ name: value, avatar })
}

function formatCommitActor(commit = {}) {
  const author = String(commit.author || '').trim()
  const committer = String(commit.committer || '').trim()
  if (author && committer && author.toLowerCase() !== committer.toLowerCase()) return `${author} 撰写 · ${committer} 提交`
  return author || committer || ''
}

function sameSha(left = '', right = '') {
  const a = String(left || '').trim().toLowerCase()
  const b = String(right || '').trim().toLowerCase()
  if (!a || !b) return false
  return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b))
}

function shortSha(value = '') {
  return String(value || '').trim().slice(0, 7)
}
