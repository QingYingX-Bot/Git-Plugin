import fs from 'node:fs'
import YAML from 'yaml'
import { getGitConfig, getPluginRoot } from './components/config.js'
import { resolve } from 'node:path'
import { RepoStore } from './model/repoStore.js'
import { makeRepoKey, splitFullName } from './model/platform.js'
import { runRepoUpdateCheck } from './model/repoUpdateService.js'

const userConfigPath = resolve(getPluginRoot(), 'config', 'config', 'git.yaml')

const get = (obj, field) => {
  return field.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj)
}

const set = (obj, field, value) => {
  const keys = field.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
  return obj
}

const URL_PLATFORM_MAP = [
  { pattern: /github\.com/i, platform: 'github' },
  { pattern: /gitee\.com/i, platform: 'gitee' },
  { pattern: /gitcode\.com/i, platform: 'gitcode' },
]

function parseRepoInput(raw, defaultPlatform) {
  let input = String(raw || '').trim()
  let platform = String(defaultPlatform || '').trim()
  let instance = ''
  let fullName = ''

  // Match full URL: https://github.com/owner/repo or https://gitea.example.com/owner/repo
  const urlMatch = input.match(/^(https?:\/\/[^/]+)\/([^/]+\/[^/]+?)(?:\.git)?(?:\s|$)/)
  if (urlMatch) {
    const host = urlMatch[1]
    fullName = urlMatch[2].replace(/^\/+|\/+$/g, '')
    // Auto-detect platform from URL
    for (const { pattern, platform: p } of URL_PLATFORM_MAP) {
      if (pattern.test(host)) { platform = p; break }
    }
    if (!platform) {
      // Not github/gitee/gitcode → treat as Gitea instance
      platform = 'gitea'
      instance = host.replace(/\/+$/, '')
    }
    return { platform, instance, fullName }
  }

  // Gitea: "https://gitea.example.com owner/repo"
  if (platform === 'gitea') {
    const giteaMatch = input.match(/^(https?:\/\/\S+)\s+(.+)$/)
    if (giteaMatch) {
      instance = giteaMatch[1].replace(/\/+$/, '')
      fullName = giteaMatch[2].replace(/^\/+|\/+$/g, '')
      return { platform, instance, fullName }
    }
  }

  // Plain owner/repo
  fullName = input.replace(/^\/+|\/+$/g, '')
  return { platform, instance, fullName }
}

function loadSubscriptionRows() {
  const store = new RepoStore()
  const rows = []
  for (const item of store.listAllSubscriptions()) {
    const ref = item.ref || {}
    const { owner, repo } = splitFullName(ref.fullName || '')
    const instance = ref.instance || ''
    const displayFullName = instance ? `${instance} ${ref.fullName || `${owner}/${repo}`}` : (ref.fullName || `${owner}/${repo}`)
    const repoToken = store.getRepoToken(item.key)
    for (const origin of (item.subscribers || [])) {
      // Parse origin format: "bot_id:type:id" or "type:id"
      const parts = String(origin).split(':')
      let botId = ''
      let type = ''
      let id = ''
      if (parts.length >= 3) {
        botId = parts[0]
        type = parts[1]
        id = parts.slice(2).join(':')
      } else if (parts.length === 2) {
        type = parts[0]
        id = parts[1]
      }
      const isGroup = type === 'group'
      const isPrivate = type === 'private'
      // Store with bot_id prefix if available
      const groupValue = botId ? `${botId}:${id}` : id
      const friendValue = botId ? `${botId}:${id}` : id
      rows.push({
        platform: ref.platform || '',
        fullName: displayFullName,
        groups: isGroup ? [groupValue] : [],
        friends: isPrivate ? [friendValue] : [],
        token: repoToken
      })
    }
  }
  return rows
}

function applySubscriptionRows(rows) {
  const store = new RepoStore()
  const existing = store.listAllSubscriptions()

  // Build set of existing (key\torigin) pairs
  const existingPairs = new Set()
  for (const item of existing) {
    for (const origin of (item.subscribers || [])) {
      existingPairs.add(`${item.key}\t${origin}`)
    }
  }

  // Parse submitted rows into (ref, origin) entries
  const submittedEntries = []
  for (const row of rows) {
    const rawFullName = String(row?.fullName || '').trim()
    if (!rawFullName) continue

    const { platform, instance, fullName } = parseRepoInput(rawFullName, row?.platform)
    if (!platform || !/^[^/]+\/[^/]+$/.test(fullName)) continue

    const [owner, repo] = fullName.split('/')
    const ref = { platform, fullName, owner, repo }
    if (instance) ref.instance = instance
    const key = makeRepoKey(ref)

    // Save per-repo token
    const token = String(row?.token || '').trim()
    store.setRepoToken(key, token)

    // Expand groups and friends arrays into origin entries
    const groups = Array.isArray(row?.groups) ? row.groups : []
    const friends = Array.isArray(row?.friends) ? row.friends : []
    for (const g of groups) {
      const raw = String(g || '').trim()
      if (!raw) continue
      // Support "bot_id:group_id" format
      const parts = raw.split(':')
      if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
        // Has bot_id prefix: "bot_id:group_id" -> "bot_id:group:group_id"
        submittedEntries.push({ key, ref, origin: `${parts[0]}:group:${parts.slice(1).join(':')}` })
      } else {
        // Plain group id: "123456" -> "group:123456"
        const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
        if (id) submittedEntries.push({ key, ref, origin: `group:${id}` })
      }
    }
    for (const f of friends) {
      const raw = String(f || '').trim()
      if (!raw) continue
      const parts = raw.split(':')
      if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
        submittedEntries.push({ key, ref, origin: `${parts[0]}:private:${parts.slice(1).join(':')}` })
      } else {
        const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
        if (id) submittedEntries.push({ key, ref, origin: `private:${id}` })
      }
    }
  }

  // Add new
  for (const { key, ref, origin } of submittedEntries) {
    if (!existingPairs.has(`${key}\t${origin}`)) {
      store.addSubscription(origin, ref, {})
    }
  }

  // Remove deleted
  for (const item of existing) {
    for (const origin of (item.subscribers || [])) {
      const pairKey = `${item.key}\t${origin}`
      if (!submittedEntries.some(e => `${e.key}\t${e.origin}` === pairKey)) {
        store.removeSubscription(origin, item.ref)
      }
    }
  }

  // Clean up tokens for removed repos
  const submittedKeys = new Set(submittedEntries.map(e => e.key))
  for (const item of existing) {
    if (!submittedKeys.has(item.key)) {
      store.removeRepoToken(item.key)
    }
  }
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'Git-Plugin',
      title: 'Git-Plugin',
      author: 'wwj',
      authorLink: 'https://github.com/QingYingX-Bot',
      link: 'https://github.com/QingYingX-Bot/Git-Plugin',
      isV3: true,
      isV2: false,
      description: '支持 GitHub/Gitee/GitCode/Gitea 的仓库信息查询、订阅推送等功能',
      icon: 'mdi:git',
      iconColor: '#d44eef',
    },
    configInfo: {
      schemas,
      getConfigData() {
        const config = getGitConfig()
        config.subscriptionData = {
          subscriptions: loadSubscriptionRows()
        }
        // Convert flat notifyTargets array to GSubForm rows
        const rawTargets = Array.isArray(config.autoScan?.notifyTargets) ? config.autoScan.notifyTargets : []
        const notifyRows = []
        for (const origin of rawTargets) {
          const o = String(origin || '').trim()
          // Parse origin format: "bot_id:type:id" or "type:id"
          const parts = o.split(':')
          let botId = ''
          let type = ''
          let id = ''
          if (parts.length >= 3) {
            botId = parts[0]
            type = parts[1]
            id = parts.slice(2).join(':')
          } else if (parts.length === 2) {
            type = parts[0]
            id = parts[1]
          }
          const isGroup = type === 'group'
          const isPrivate = type === 'private'
          const groupValue = botId ? `${botId}:${id}` : id
          const friendValue = botId ? `${botId}:${id}` : id
          notifyRows.push({
            groups: isGroup ? [groupValue] : [],
            friends: isPrivate ? [friendValue] : []
          })
        }
        if (config.autoScan) {
          config.autoScan.notifyTargets = notifyRows
        }
        return config
      },
      setConfigData(data, { Result }) {
        try {
          const defaults = getGitConfig()
          const merged = { ...defaults }
          for (const schema of schemas) {
            if (!schema.field) continue
            if (schema.field.startsWith('subscriptionData.')) continue
            if (schema.field === 'autoScan.notifyTargets') continue
            const value = get(data, schema.field)
            if (value !== undefined) set(merged, schema.field, value)
          }

          // Convert GSubForm notifyTargets to flat origin array
          if (data.autoScan?.notifyTargets !== undefined) {
            const targets = []
            for (const item of data.autoScan.notifyTargets) {
              for (const g of (item.groups || [])) {
                const raw = String(g || '').trim()
                if (!raw) continue
                // Support "bot_id:group_id" format
                const parts = raw.split(':')
                if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
                  targets.push(`${parts[0]}:group:${parts.slice(1).join(':')}`)
                } else {
                  const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
                  if (id) targets.push(`group:${id}`)
                }
              }
              for (const f of (item.friends || [])) {
                const raw = String(f || '').trim()
                if (!raw) continue
                const parts = raw.split(':')
                if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
                  targets.push(`${parts[0]}:private:${parts.slice(1).join(':')}`)
                } else {
                  const id = parts.length >= 2 ? parts.slice(1).join(':') : raw
                  if (id) targets.push(`private:${id}`)
                }
              }
            }
            set(merged, 'autoScan.notifyTargets', targets)
          }

          fs.writeFileSync(userConfigPath, YAML.stringify(merged))

          if (data.subscriptionData?.subscriptions !== undefined) {
            applySubscriptionRows(data.subscriptionData.subscriptions)
          }

          // Trigger repo update check immediately if enabled
          if (merged.repoUpdate?.enabled && data.repoUpdate) {
            runRepoUpdateCheck(merged).catch(err => logger.warn(`[Git-Plugin] 保存后触发更新检测失败: ${err.message}`))
          }

          return Result.ok({}, '保存成功~')
        } catch (error) {
          logger.error(`[Git-Plugin] 保存配置失败: ${error.message}`)
          return Result.error(error.message || '保存失败')
        }
      },
    },
  }
}

const schemas = [
        // ========== 基本设置 ==========
        { label: '基本设置', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'defaultPlatform',
          label: '默认平台',
          bottomHelpMessage: '通用命令未指定平台时使用',
          component: 'Select',
          componentProps: {
            options: [
              { label: 'GitHub', value: 'github' },
              { label: 'Gitee', value: 'gitee' },
              { label: 'GitCode', value: 'gitcode' },
              { label: 'Gitea', value: 'gitea' },
            ],
          },
        },
        {
          field: 'autoResolveLinks',
          label: '自动解析链接',
          bottomHelpMessage: '是否自动解析消息中的仓库链接',
          component: 'Switch',
        },
        {
          field: 'useLowercaseRepo',
          label: '仓库名小写',
          bottomHelpMessage: '是否把 owner/repo 转成小写用于订阅匹配',
          component: 'Switch',
        },
        {
          field: 'requestTimeoutMs',
          label: '请求超时(毫秒)',
          bottomHelpMessage: 'API 请求超时时间，单位毫秒',
          component: 'InputNumber',
          componentProps: { min: 1000, max: 60000 },
        },
        {
          field: 'proxy',
          label: '网络代理',
          bottomHelpMessage: '影响平台 API 请求和图片下载。留空使用系统默认网络',
          component: 'Input',
          componentProps: { placeholder: '留空使用系统默认网络' },
        },
        {
          field: 'pollingEnabled',
          label: '开启轮询',
          bottomHelpMessage: 'Webhook 可实时推送，轮询用于兜底',
          component: 'Switch',
        },
        {
          field: 'checkIntervalMinutes',
          label: '轮询间隔(分钟)',
          bottomHelpMessage: '轮询间隔，单位分钟',
          component: 'InputNumber',
          componentProps: { min: 1, max: 1440 },
        },

        // ========== 平台 Token ==========
        { label: '平台 Token', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'providers.github.token',
          label: 'GitHub Token',
          bottomHelpMessage: 'GitHub fine-grained PAT，建议权限：Contents / Issues / Pull requests 只读',
          component: 'InputPassword',
        },
        {
          field: 'providers.gitee.token',
          label: 'Gitee Token',
          bottomHelpMessage: 'Gitee 私人令牌，建议只给仓库 / Issue / PR 读权限',
          component: 'InputPassword',
        },
        {
          field: 'providers.gitcode.token',
          label: 'GitCode Token',
          bottomHelpMessage: 'GitCode access token，建议只给仓库 / Issue / PR 读权限',
          component: 'InputPassword',
        },
        {
          field: 'providers.gitea.instances.default.baseUrl',
          label: 'Gitea 实例地址',
          bottomHelpMessage: '例如 https://gitea.example.com',
          component: 'Input',
          componentProps: { placeholder: 'https://gitea.example.com' },
        },
        {
          field: 'providers.gitea.instances.default.token',
          label: 'Gitea Token',
          bottomHelpMessage: '建议只给 repository / issue 读权限',
          component: 'InputPassword',
        },

        // ========== 仓库更新 ==========
        { label: '仓库更新', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'repoUpdate.enabled',
          label: '启用仓库更新检测',
          bottomHelpMessage: '定时检查仓库是否有新 commit 并推送',
          component: 'Switch',
        },
        {
          field: 'repoUpdate.cron',
          label: '检测 Cron',
          bottomHelpMessage: 'Cron 表达式，默认每 30 分钟检查一次',
          component: 'EasyCron',
          componentProps: { placeholder: '请输入 Cron 表达式', hideYear: true },
        },
        {
          field: 'repoUpdate.scanPath',
          label: '扫描路径',
          bottomHelpMessage: '自动扫描本地插件时的路径，留空使用 plugins 目录',
          component: 'Input',
          componentProps: { placeholder: '留空使用 plugins 目录' },
        },
        {
          field: 'repoUpdate.list',
          label: '检测列表',
          bottomHelpMessage: '每条记录可独立配置推送目标、仓库和自动扫描。保存后立即生效，无需重启。',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'groups',
                label: '推送群',
                component: 'GSelectGroup',
                componentProps: {
                  placeholder: '点击选择要接收推送的群',
                  valueFormatter: ((value) => String(value || '').replace(/^\d+:/, '')).toString()
                },
              },
              {
                field: 'friends',
                label: '推送好友',
                component: 'GSelectFriend',
                componentProps: { placeholder: '点击选择要接收推送的好友' },
              },
              {
                field: 'autoScan',
                label: '自动扫描本地插件',
                bottomHelpMessage: '开启后自动扫描本地 git 仓库加入检测',
                component: 'Switch',
              },
              {
                field: 'repos',
                label: '手动仓库',
                component: 'GSubForm',
                componentProps: {
                  multiple: true,
                  valueFormatter: ((value) => Array.isArray(value) ? value.map(r => `${r.platform || ''}:${r.repo || ''}`).join(', ') || '无' : '无').toString(),
                  schemas: [
                    {
                      field: 'platform',
                      label: '平台',
                      required: true,
                      component: 'Select',
                      componentProps: {
                        options: [
                          { label: 'GitHub', value: 'github' },
                          { label: 'Gitee', value: 'gitee' },
                          { label: 'GitCode', value: 'gitcode' },
                          { label: 'Gitea', value: 'gitea' },
                        ],
                      },
                    },
                    {
                      field: 'repo',
                      label: '仓库',
                      required: true,
                      component: 'Input',
                      componentProps: { placeholder: 'owner/repo' },
                    },
                    {
                      field: 'branch',
                      label: '分支',
                      component: 'Input',
                      componentProps: { placeholder: '留空使用默认分支' },
                    },
                    {
                      field: 'token',
                      label: '专属 Token',
                      component: 'InputPassword',
                      bottomHelpMessage: '留空使用全局 Token',
                      componentProps: { placeholder: '留空使用全局 Token' },
                    },
                  ],
                },
              },
              {
                field: 'exclude',
                label: '排除仓库',
                component: 'Select',
                componentProps: {
                  mode: 'tags',
                  placeholder: '输入 owner/repo 或 owner/repo:branch 后回车',
                  tokenSeparators: [',', '，', ' ']
                },
              },
              {
                field: 'note',
                label: '备注',
                component: 'Input',
                componentProps: { placeholder: '可选备注' },
              },
            ],
          },
        },

        // ========== 订阅管理 ==========
        { label: 'Issue/PR 订阅', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'subscriptionData.subscriptions',
          label: 'Issue/PR 订阅',
          bottomHelpMessage: '订阅仓库的 Issue 和 Pull Request 更新，有新 Issue/PR 时推送到指定群或好友。仓库支持粘贴链接自动识别平台。',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'groups',
                label: '推送群',
                component: 'GSelectGroup',
                componentProps: {
                  placeholder: '点击选择要接收推送的群',
                  valueFormatter: ((value) => String(value || '').replace(/^\d+:/, '')).toString()
                },
              },
              {
                field: 'friends',
                label: '推送好友',
                component: 'GSelectFriend',
                componentProps: { placeholder: '点击选择要接收推送的好友' },
              },
              {
                field: 'fullName',
                label: '仓库',
                required: true,
                component: 'Input',
                componentProps: { placeholder: '链接或 owner/repo，如 https://github.com/microsoft/vscode' },
              },
              {
                field: 'platform',
                label: '平台',
                component: 'Select',
                bottomHelpMessage: '填链接时自动识别，填 owner/repo 时需手动选择',
                componentProps: {
                  options: [
                    { label: 'GitHub', value: 'github' },
                    { label: 'Gitee', value: 'gitee' },
                    { label: 'GitCode', value: 'gitcode' },
                    { label: 'Gitea', value: 'gitea' },
                  ],
                },
              },
              {
                field: 'token',
                label: '专属 Token',
                component: 'InputPassword',
                bottomHelpMessage: '留空使用全局 Token；填写后仅该仓库使用此 Token 访问 API',
                componentProps: { placeholder: '留空使用全局 Token' },
              },
            ],
          },
        },

        // ========== 渲染设置 ==========
        { label: '渲染设置', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'renderImageDownloadLog',
          label: '渲染图片下载日志',
          bottomHelpMessage: '排查下载慢时开启；失败日志始终输出 warn',
          component: 'Switch',
        },
        {
          field: 'readme.multiPage',
          label: 'README 多页模式',
          bottomHelpMessage: '是否把长 README 分割成多张图片，关闭后生成单张长图',
          component: 'Switch',
        },
        {
          field: 'readme.multiPageHeight',
          label: 'README 多页高度',
          bottomHelpMessage: '分割模式下每张图片高度',
          component: 'InputNumber',
          componentProps: { min: 1000, max: 10000 },
        },
        {
          field: 'readme.pageGotoTimeoutMs',
          label: 'README 页面超时(毫秒)',
          bottomHelpMessage: '长 README / 大图较多时可调大',
          component: 'InputNumber',
          componentProps: { min: 30000, max: 600000 },
        },
        {
          field: 'card.githubMode',
          label: 'GitHub 卡片模式',
          bottomHelpMessage: 'opengraph 使用 GitHub 官方图片；template 使用插件内置模板统一风格',
          component: 'Select',
          componentProps: {
            options: [
              { label: 'OpenGraph', value: 'opengraph' },
              { label: '模板', value: 'template' },
            ],
          },
        },

        // ========== Webhook ==========
        { label: 'Webhook', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'webhook.enabled',
          label: '启用 Webhook',
          bottomHelpMessage: '是否启动 webhook 接收服务',
          component: 'Switch',
        },
        {
          field: 'webhook.host',
          label: '监听地址',
          bottomHelpMessage: '0.0.0.0 表示允许外部访问',
          component: 'Input',
          componentProps: { placeholder: '0.0.0.0' },
        },
        {
          field: 'webhook.port',
          label: '监听端口',
          component: 'InputNumber',
          componentProps: { min: 1, max: 65535 },
        },
        {
          field: 'webhook.path',
          label: 'Webhook 路径',
          component: 'Input',
          componentProps: { placeholder: '/git/webhook' },
        },
        {
          field: 'webhook.secret',
          label: 'Webhook Secret',
          bottomHelpMessage: '建议填写随机字符串，并与平台侧 Secret 保持一致',
          component: 'InputPassword',
        },
        {
          field: 'webhook.pushClosedEvents',
          label: '推送关闭事件',
          bottomHelpMessage: '是否推送 Issues / PR 的 closed 事件',
          component: 'Switch',
        },
        {
          field: 'webhook.allowedEventTypes',
          label: '允许的事件类型',
          bottomHelpMessage: '详见 WEBHOOK_EVENTS.md',
          component: 'Select',
          componentProps: {
            mode: 'multiple',
            options: [
              { label: 'Issues', value: 'issues' },
              { label: 'Pull Requests', value: 'pull_requests' },
              { label: 'Push', value: 'push' },
            ],
          },
        },
      ]