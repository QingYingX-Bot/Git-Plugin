import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { getGitConfig, getPluginRoot } from '../components/config.js'
import { shortText } from './formatters/common.js'
import { getPlatformLabel } from './platform.js'
import MarkdownIt from 'markdown-it'
import { cleanupTempFiles, localizeImageUrl, toDataUrl } from './renderAssets.js'

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', accentLight: '#e6edf3', accentSoftLight: 'rgba(230, 237, 243, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', accentLight: '#ff6b6b', accentSoftLight: 'rgba(255, 107, 107, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#e60012', accentSoft: 'rgba(230, 0, 18, 0.14)', accentLight: '#ff4d5d', accentSoftLight: 'rgba(255, 77, 93, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', accentLight: '#8fce4a', accentSoftLight: 'rgba(143, 206, 74, 0.14)', icon: 'gitea.svg' }
}

const md = new MarkdownIt()
const FONT_URL = pathToFileURL(path.join(getPluginRoot(), 'resources', 'fonts', 'HarmonyOS_SansSC_Bold.ttf')).href
const BIZ_TIME_ZONE = 'Asia/Shanghai'
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BIZ_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

const ICON_CACHE = new Map()

export const renderRepoUpdateCard = async update => {
  const ref = update.ref || {}
  const platform = ref.platform || update.platform || 'github'
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github
  const cleanupFiles = []
  try {
    const theme = normalizeTheme(update.theme || getGitConfig()?.repoUpdate?.theme)
    const avatarUrl = update.authorAvatar || getAuthorAvatarUrl(platform, update.author)
    const authorAvatar = await fetchAvatarAsDataUrl(avatarUrl, cleanupFiles)
    const message = update.message || '新提交'
    const lines = message.split('\n')
    const branch = ref.branch || update.branch || 'main'
    const commits = normalizeUpdateCommits(update.commits)
    const commitCount = Number(update.commitCount || commits.length || 1)
    const title = commitCount > 1 ? `${commitCount} 个提交更新到 ${branch}` : (lines[0] || '新提交')
    const body = commitCount > 1 ? '' : lines.slice(1).join('\n').trim()
    const commitTime = update.time || ''

    return await puppeteer.screenshot('Git-Plugin/repo-update-card', {
      tplFile: path.join(getPluginRoot(), 'resources', 'repo-update-card.html'),
      saveId: `repo-update-${platform}-${safeName(ref.fullName || update.fullName)}-${safeName(update.sha)}`,
      imgType: 'png',
      quality: 100,
      pageGotoParams: { waitUntil: 'networkidle0' },
      update: {
        ...update,
        platform,
        fullName: ref.fullName || update.fullName || '',
        platformLabel: getPlatformLabel(platform),
        platformIconSvg: loadIcon(platform),
        accent: style.accent,
        accentSoft: style.accentSoft,
        accentLight: style.accentLight,
        accentSoftLight: style.accentSoftLight,
        fontUrl: FONT_URL,
        theme,
        title: shortText(title, 100),
        messageHtml: body ? md.render(body) : '',
        commitCount,
        commits,
        hiddenCommitCount: Math.max(0, commitCount - commits.length),
        author: update.author || 'unknown',
        authorAvatar,
        sha: update.sha || 'unknown',
        branch,
        time: formatDateTime(commitTime),
        metaTime: formatMetaTime(commitTime),
        filesChanged: update.filesChanged || 0,
        additions: update.additions || 0,
        deletions: update.deletions || 0,
        releaseInfo: normalizeReleaseInfo(update.releaseInfo),
        rewrite: normalizeRewrite(update.rewrite, update.sha)
      }
    })
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染仓库更新卡片失败: ${err?.message || err}`)
    return false
  } finally {
    await cleanupTempFiles(cleanupFiles)
  }
}

const loadIcon = platform => {
  const icon = PLATFORM_STYLES[platform]?.icon || PLATFORM_STYLES.github.icon
  if (ICON_CACHE.has(icon)) return ICON_CACHE.get(icon)
  try {
    const svg = fs.readFileSync(path.join(getPluginRoot(), 'resources', 'icons', icon), 'utf8')
    ICON_CACHE.set(icon, svg)
    return svg
  } catch {
    return ''
  }
}

const getAuthorAvatarUrl = (platform, author) => {
  if (!author || author === 'unknown') {
    return ''
  }

  switch (platform) {
    case 'github':
      if (!/^[\w-]+$/.test(author)) return ''
      return `https://github.com/${author}.png?size=56`
    case 'gitee':
      if (!/^[\w.-]+$/.test(author)) return ''
      return `https://gitee.com/${author}.png`
    default:
      return ''
  }
}

const fetchAvatarAsDataUrl = async (url, cleanupFiles) => {
  if (!url) return ''
  const file = await localizeImageUrl(url, 'repo-update-avatars')
  if (!file) return ''
  cleanupFiles.push(file)
  return toDataUrl(file)
}

const safeName = value => String(value || 'repo').replace(/[^\w.-]+/g, '-').slice(0, 80)

const normalizeTheme = value => String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light'

const normalizeRewrite = (rewrite, updateSha) => {
  if (!rewrite) return null
  return {
    fromSha: shortSha(rewrite.fromSha),
    toSha: shortSha(rewrite.toSha),
    updateSha: shortSha(rewrite.updateSha || updateSha)
  }
}

const normalizeReleaseInfo = releaseInfo => {
  if (!releaseInfo) return null
  const type = releaseInfo.type === 'release' ? 'release' : 'tag'
  return {
    type,
    typeLabel: type === 'release' ? 'Release' : 'Tag',
    tag: shortText(releaseInfo.tag, 28),
    title: shortText(releaseInfo.title, 80),
    publishedAt: releaseInfo.publishedAt ? formatDateTime(releaseInfo.publishedAt) : '',
    prerelease: Boolean(releaseInfo.prerelease),
    draft: Boolean(releaseInfo.draft)
  }
}

const shortSha = value => String(value || '').trim().slice(0, 7)

const normalizeUpdateCommits = commits => Array.isArray(commits)
  ? commits.filter(item => item?.sha || item?.title).slice(0, 8).map(item => ({
    sha: shortSha(item.sha),
    title: shortText(item.title || item.message || '新提交', 88),
    actor: shortText(item.actor || formatCommitActor(item), 86),
    time: formatMetaTime(item.time),
    url: item.url || ''
  }))
  : []

const formatCommitActor = item => {
  const author = String(item?.author || '').trim()
  const committer = String(item?.committer || '').trim()
  if (author && committer && author.toLowerCase() !== committer.toLowerCase()) return `${author} 撰写 · ${committer} 提交`
  return author || committer || ''
}

const formatMetaTime = value => {
  const relative = formatRelativeTime(value)
  return relative || (parseDate(value) ? formatDateTime(value) : '')
}

const formatDateTime = value => {
  const date = parseDate(value)
  if (!date) return '未知'
  return DATE_TIME_FORMATTER.format(date)
}

const formatRelativeTime = value => {
  const date = parseDate(value)
  if (!date) return ''
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return ''

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return '刚刚'
  if (diffMs < 2 * minute) return '一分钟前'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`
  if (diffMs < 2 * hour) return '一小时前'
  if (diffMs < day) return `${Math.floor(diffMs / hour)}小时前`
  if (diffMs < 2 * day) return '昨天'
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}天前`
  return ''
}

const parseDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
