import fs from 'node:fs'
import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { getPluginRoot } from '../components/config.js'
import { formatDate, shortText } from './formatters/common.js'
import { getPlatformLabel } from './platform.js'

const PLATFORM_STYLES = {
  github: { accent: '#24292f', accentSoft: 'rgba(36, 41, 47, 0.14)', icon: 'github.svg' },
  gitee: { accent: '#c71d23', accentSoft: 'rgba(199, 29, 35, 0.14)', icon: 'gitee.svg' },
  gitcode: { accent: '#2f6fed', accentSoft: 'rgba(47, 111, 237, 0.14)', icon: 'gitcode.svg' },
  gitea: { accent: '#609926', accentSoft: 'rgba(96, 153, 38, 0.14)', icon: 'gitea.svg' }
}

const ICON_CACHE = new Map()

export const renderRepoUpdateCard = async update => {
  const style = PLATFORM_STYLES[update.platform] || PLATFORM_STYLES.github
  try {
    return await puppeteer.screenshot('Git-Plugin/repo-update-card', {
      tplFile: path.join(getPluginRoot(), 'resources', 'repo-update-card.html'),
      saveId: `repo-update-${update.platform}-${safeName(update.fullName)}-${safeName(update.sha)}`,
      imgType: 'png',
      quality: 100,
      update: {
        ...update,
        platformLabel: getPlatformLabel(update.platform),
        platformIconSvg: loadIcon(update.platform),
        accent: style.accent,
        accentSoft: style.accentSoft,
        message: shortText(update.message || '新提交', 90),
        author: update.author || 'unknown',
        sha: update.sha || 'unknown',
        time: formatDate(update.time || new Date().toISOString())
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

const safeName = value => String(value || 'repo').replace(/[^\w.-]+/g, '-').slice(0, 80)
