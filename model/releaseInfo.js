const TAG_PAGE_SIZE = 50

const text = value => String(value ?? '').trim()

const firstUrl = (...values) => values.map(text).find(Boolean) || ''

export async function getCommitReleaseInfo(provider, ref, sha) {
  const tags = await listTags(provider, ref)
  const tag = tags.find(item => sameSha(tagSha(item), sha))
  if (!tag) return null

  const tagName = text(tag.name || tag.tag_name)
  if (!tagName) return null

  const release = await getReleaseByTag(provider, ref, tagName).catch(() => null)
  return normalizeReleaseInfo(tagName, tag, release)
}

async function listTags(provider, ref) {
  const data = await provider.get(`/repos/${provider.repoPath(ref)}/tags`, {
    per_page: TAG_PAGE_SIZE,
    limit: TAG_PAGE_SIZE,
    page: 1
  })
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.list)) return data.list
  return []
}

async function getReleaseByTag(provider, ref, tagName) {
  return provider.get(`/repos/${provider.repoPath(ref)}/releases/tags/${encodeURIComponent(tagName)}`)
}

function normalizeReleaseInfo(tagName, tag, release) {
  const hasRelease = release && typeof release === 'object'
  const title = hasRelease ? text(release.name || release.title) : ''
  return {
    type: hasRelease ? 'release' : 'tag',
    tag: tagName,
    title: title && title !== tagName ? title : '',
    url: firstUrl(release?.html_url, release?.web_url, release?.url, tag.html_url, tag.web_url),
    publishedAt: text(release?.published_at || release?.created_at || tag.created_at),
    prerelease: Boolean(release?.prerelease),
    draft: Boolean(release?.draft)
  }
}

function tagSha(tag = {}) {
  return text(
    tag.commit?.sha ||
    tag.commit?.id ||
    tag.target_commitish ||
    tag.target ||
    tag.sha ||
    tag.id
  )
}

function sameSha(left = '', right = '') {
  const a = text(left).toLowerCase()
  const b = text(right).toLowerCase()
  if (!a || !b) return false
  return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b))
}
