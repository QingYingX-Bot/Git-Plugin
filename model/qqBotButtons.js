import path from 'node:path'
import { makeRepoKey } from './platform.js'
import { scanLocalRepos } from './localScanner.js'

const BUTTON_STYLE_DEFAULT = 1

export function getQQBotButtonConfig(config = {}) {
  const value = config.qqBotButtons || config.repoUpdate?.qqBotButtons || {}
  return {
    enabled: value.enabled !== false,
    showCommit: value.showCommit !== false,
    showRepo: value.showRepo !== false,
    showCompare: Boolean(value.showCompare),
    showRelease: value.showRelease !== false,
    showUpdatePlugin: value.showUpdatePlugin !== false,
    updateAction: normalizeUpdateAction(value.updateAction),
    updateCommand: String(value.updateCommand || '#更新{plugin}').trim() || '#更新{plugin}'
  }
}

export function targetsIncludeQQBot(targets = []) {
  return targets.some(origin => {
    const botId = String(origin || '').split(':')[0]
    const bot = botId && Bot?.[botId]
    return bot?.version?.id === 'QQBot' || bot?.adapter?.id === 'QQBot' || bot?.adapter?.name === 'QQBot'
  })
}

export async function attachLocalPluginNames(items) {
  const localRepos = await scanLocalRepos(path.join(process.cwd(), 'plugins')).catch(err => {
    logger.warn(`[Git-Plugin] 扫描本地插件仓库失败: ${err.message}`)
    return []
  })
  if (!localRepos.length) return

  const localPluginMap = new Map()
  for (const repo of localRepos) {
    const pluginName = path.basename(repo.dir || '')
    const key = repoLookupKey(repo)
    if (pluginName && key) localPluginMap.set(key, pluginName)
  }

  const rows = items instanceof Map ? items.values() : items || []
  for (const item of rows) {
    const ref = item.ref || item
    item.localPluginName = localPluginMap.get(repoLookupKey(ref)) || ''
  }
}

export function buildRepoUpdateButtons(update, config) {
  const buttonConfig = getQQBotButtonConfig(config)
  if (!buttonConfig.enabled) return []

  const linkRow = []
  const compareUrl = buttonConfig.showCompare && !update.rewrite
    ? buildCompareUrl(update.ref, config, update.previousSha, update.fullSha)
    : ''
  if (compareUrl) {
    linkRow.push(createLinkButton('查看对比', compareUrl))
  } else if (buttonConfig.showCommit && update.url) {
    linkRow.push(createLinkButton('查看提交', update.url))
  }

  const repoUrl = buildRepoWebUrl(update.ref, config)
  if (buttonConfig.showRepo && repoUrl && repoUrl !== update.url && repoUrl !== compareUrl) {
    linkRow.push(createLinkButton('打开仓库', repoUrl))
  }

  const releaseUrl = String(update.releaseInfo?.url || '').trim()
  if (buttonConfig.showRelease && releaseUrl && ![update.url, repoUrl, compareUrl].includes(releaseUrl)) {
    linkRow.push(createLinkButton('查看版本', releaseUrl))
  }

  const actionRow = buildUpdatePluginRow(update.localPluginName, buttonConfig)
  return [linkRow, actionRow].filter(row => row.length)
}

export function buildWebhookPushButtons(push, config) {
  const buttonConfig = getQQBotButtonConfig(config)
  if (!buttonConfig.enabled) return []

  const ref = push.ref || {}
  const linkRow = []
  if (buttonConfig.showCompare && push.url) {
    linkRow.push(createLinkButton('查看对比', push.url))
  }

  const repoUrl = buildRepoWebUrl(ref, config)
  if (buttonConfig.showRepo && repoUrl && repoUrl !== push.url) {
    linkRow.push(createLinkButton('打开仓库', repoUrl))
  }

  const actionRow = buildUpdatePluginRow(push.localPluginName, buttonConfig)
  return [linkRow, actionRow].filter(row => row.length)
}

function buildUpdatePluginRow(pluginName, buttonConfig) {
  if (!buttonConfig.showUpdatePlugin || !pluginName) return []
  const command = buttonConfig.updateCommand.replace(/\{plugin\}/g, pluginName)
  if (buttonConfig.updateAction === 'input') {
    return [{
      text: '更新插件',
      input: command,
      send: true,
      style: BUTTON_STYLE_DEFAULT
    }]
  }

  return [{
    text: '更新插件',
    clicked_text: '开始更新',
    callback: command,
    toCallback: true,
    style: BUTTON_STYLE_DEFAULT,
    content: `确认更新 ${pluginName}？`,
    confirm_text: '更新',
    cancel_text: '取消'
  }]
}

function createLinkButton(text, link) {
  return { text, link, style: BUTTON_STYLE_DEFAULT }
}

function normalizeUpdateAction(value) {
  return String(value || '').trim().toLowerCase() === 'callback' ? 'callback' : 'input'
}

function buildRepoWebUrl(ref = {}, config = {}) {
  const fullName = String(ref.fullName || '').trim().replace(/^\/+|\/+$/g, '')
  if (!fullName) return ''

  const platform = String(ref.platform || '').trim()
  const defaults = {
    github: 'https://github.com',
    gitee: 'https://gitee.com',
    gitcode: 'https://gitcode.com'
  }
  const base = platform === 'gitea'
    ? String(ref.instance || config.providers?.gitea?.instances?.default?.baseUrl || '').trim()
    : String(config.providers?.[platform]?.webBase || defaults[platform] || '').trim()

  return base ? `${base.replace(/\/+$/g, '')}/${fullName}` : ''
}

function buildCompareUrl(ref, config, fromSha, toSha) {
  const from = String(fromSha || '').trim()
  const to = String(toSha || '').trim()
  const repoUrl = buildRepoWebUrl(ref, config)
  return repoUrl && from && to ? `${repoUrl}/compare/${from}...${to}` : ''
}

function repoLookupKey(ref) {
  return makeRepoKey(ref).toLowerCase()
}
