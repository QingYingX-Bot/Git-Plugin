import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { getGitConfig, getPluginRoot } from '../components/config.js'
import { formatDate, shortText } from './formatters/common.js'
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
    const title = lines[0] || '新提交'
    const body = lines.slice(1).join('\n').trim()

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
        author: update.author || 'unknown',
        authorAvatar,
        sha: update.sha || 'unknown',
        branch: ref.branch || update.branch || 'main',
        time: formatDate(update.time || new Date().toISOString()),
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
      return `https://github.com/${author}.png?size=56`
    case 'gitee':
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
    publishedAt: releaseInfo.publishedAt ? formatDate(releaseInfo.publishedAt) : '',
    prerelease: Boolean(releaseInfo.prerelease),
    draft: Boolean(releaseInfo.draft)
  }
}

const shortSha = value => String(value || '').trim().slice(0, 7)
