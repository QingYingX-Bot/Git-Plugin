import fs from 'node:fs'
import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { getPluginRoot } from '../components/config.js'
import { formatDate, shortText } from './formatters/common.js'
import { getPlatformLabel } from './platform.js'
import MarkdownIt from 'markdown-it'
import { fetch } from 'undici'

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', accentLight: '#e6edf3', accentSoftLight: 'rgba(230, 237, 243, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', accentLight: '#ff6b6b', accentSoftLight: 'rgba(255, 107, 107, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', accentLight: '#6b9fff', accentSoftLight: 'rgba(107, 159, 255, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', accentLight: '#8fce4a', accentSoftLight: 'rgba(143, 206, 74, 0.14)', icon: 'gitea.svg' }
}

const md = new MarkdownIt()

const ICON_CACHE = new Map()

export const renderRepoUpdateCard = async update => {
  const ref = update.ref || {}
  const platform = ref.platform || update.platform || 'github'
  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.github
  try {
    const avatarUrl = update.authorAvatar || getAuthorAvatarUrl(platform, update.author)
    const authorAvatar = await fetchAvatarAsDataUrl(avatarUrl)
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
        title: shortText(title, 100),
        messageHtml: body ? md.render(body) : '',
        author: update.author || 'unknown',
        authorAvatar,
        sha: update.sha || 'unknown',
        branch: ref.branch || update.branch || 'main',
        time: formatDate(update.time || new Date().toISOString()),
        filesChanged: update.filesChanged || 0,
        additions: update.additions || 0,
        deletions: update.deletions || 0
      }
    })
  } catch (err) {
    logger.error(`[Git-Plugin] 渲染仓库更新卡片失败: ${err?.message || err}`)
    return false
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

const fetchAvatarAsDataUrl = async url => {
  if (!url) return ''
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Git-Plugin/1.0' }
    })
    if (!res.ok) return ''
    const contentType = res.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

const safeName = value => String(value || 'repo').replace(/[^\w.-]+/g, '-').slice(0, 80)
