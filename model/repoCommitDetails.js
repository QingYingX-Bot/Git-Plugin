const number = value => Number.isFinite(Number(value)) ? Number(value) : 0

export const getCommitDetailsPath = (provider, ref, sha) => {
  const endpoint = provider.platform === 'gitea' ? 'git/commits' : 'commits'
  return `/repos/${provider.repoPath(ref)}/${endpoint}/${encodeURIComponent(sha)}`
}

export const extractCommitDetails = (data = {}) => {
  const stats = data.stats || {}
  const files = Array.isArray(data.files) ? data.files : []
  const filesChanged = data.filesChanged ?? data.changed_files ?? data.files_changed
  return {
    filesChanged: filesChanged === undefined ? files.length : number(filesChanged),
    additions: number(stats.additions ?? data.additions),
    deletions: number(stats.deletions ?? data.deletions)
  }
}

export const extractCommitDetailsFromCommit = (commit = {}) => extractCommitDetails(commit.raw || commit)

export const fetchCommitDetails = async (provider, ref, sha) => {
  const query = provider.platform === 'gitea' ? { stat: true, files: true } : undefined
  const data = await provider.get(getCommitDetailsPath(provider, ref, sha), query)
  return extractCommitDetails(data)
}
