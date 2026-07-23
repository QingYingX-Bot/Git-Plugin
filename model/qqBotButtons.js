import path from 'node:path'
import { makeRepoKey } from './platform.js'
import { getStartupScannedLocalRepos } from './localScanner.js'

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

export async function attachLocalPluginNames(items, rootDir) {
  const localRepos = await getStartupScannedLocalRepos(rootDir).catch(err => {
    logger.warn(`[Git-Plugin] 扫描本地插件仓库失败: ${err.message}`)
    return []
  })
  if (!localRepos.length) return

  const localPluginMap = new Map()
  for (const repo of localRepos) {
    const pluginName = path.basename(repo.dir || '')
    const key = repoLookupKey(repo)
    if (!pluginName || !key || repo.canUpdate === false) continue
    const plugin = {
      name: pluginName,
      branch: String(repo.branch || '').trim(),
      headSha: String(repo.headSha || '').trim(),
      hasDiff: Boolean(repo.hasDiff)
    }
    localPluginMap.set(key, plugin)
    if (plugin.branch) localPluginMap.set(repoBranchLookupKey(repo), plugin)
  }

  const rows = items instanceof Map ? items.values() : items || []
  for (const item of rows) {
    const ref = item.ref || item
    const plugin = findLocalPlugin(localPluginMap, ref)
    if (isAlreadyUpdated(plugin, getTargetSha(item))) {
      item.localPluginName = ''
      item.localPluginHasDiff = false
      continue
    }
    item.localPluginName = plugin?.name || ''
    item.localPluginHasDiff = Boolean(plugin?.hasDiff)
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

  const actionRow = buildUpdatePluginRow({
    name: update.localPluginName,
    hasDiff: update.localPluginHasDiff
  }, buttonConfig)
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

  const actionRow = buildUpdatePluginRow({
    name: push.localPluginName,
    hasDiff: push.localPluginHasDiff
  }, buttonConfig)
  return [linkRow, actionRow].filter(row => row.length)
}

function buildUpdatePluginRow(plugin, buttonConfig) {
  const pluginName = typeof plugin === 'object'
    ? String(plugin?.name || '').trim()
    : String(plugin || '').trim()
  if (!buttonConfig.showUpdatePlugin || !pluginName) return []
  const force = Boolean(plugin?.hasDiff)
  const command = buildUpdateCommand(buttonConfig.updateCommand, pluginName, force)
  const text = force ? '强制更新插件' : '更新插件'
  const actionText = force ? '强制更新' : '更新'
  if (buttonConfig.updateAction === 'input') {
    return [{
      text,
      input: command,
      send: true,
      style: BUTTON_STYLE_DEFAULT
    }]
  }

  return [{
    text,
    clicked_text: `开始${actionText}`,
    callback: command,
    toCallback: true,
    style: BUTTON_STYLE_DEFAULT,
    content: `确认${actionText} ${pluginName}？`,
    confirm_text: actionText,
    cancel_text: '取消'
  }]
}

function createLinkButton(text, link) {
  return { text, link, style: BUTTON_STYLE_DEFAULT }
}

function normalizeUpdateAction(value) {
  return String(value || '').trim().toLowerCase() === 'callback' ? 'callback' : 'input'
}

function buildUpdateCommand(template, pluginName, force) {
  const command = String(template || '#更新{plugin}').replace(/\{plugin\}/g, pluginName)
  if (!force || /强制/.test(command)) return command
  if (command.includes('更新')) return command.replace('更新', '强制更新')
  return `#强制更新${pluginName}`
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

function repoBranchLookupKey(ref) {
  const branch = String(ref?.branch || '').trim()
  return branch ? `${repoLookupKey(ref)}:${branch}` : repoLookupKey(ref)
}

function findLocalPlugin(localPluginMap, ref) {
  const branch = String(ref?.branch || '').trim()
  if (branch) return localPluginMap.get(repoBranchLookupKey(ref)) || null
  return localPluginMap.get(repoLookupKey(ref)) || null
}

function getTargetSha(item = {}) {
  return String(item.fullSha || item.after || '').trim()
}

function isAlreadyUpdated(plugin, targetSha) {
  if (!plugin?.name) return false
  if (isZeroSha(targetSha)) return true
  return sameSha(plugin.headSha, targetSha)
}

function sameSha(left = '', right = '') {
  const a = String(left || '').trim().toLowerCase()
  const b = String(right || '').trim().toLowerCase()
  if (!a || !b) return false
  return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b))
}

function isZeroSha(value = '') {
  return /^0{7,40}$/.test(String(value || ''))
}
