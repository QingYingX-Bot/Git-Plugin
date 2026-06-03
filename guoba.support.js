import fs from 'node:fs'
import YAML from 'yaml'
import { getGitConfig, getPluginRoot } from './components/config.js'
import { resolve } from 'node:path'

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
      schemas: [
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

        // ========== 轮询设置 ==========
        { label: '轮询设置', component: 'SOFT_GROUP_BEGIN' },
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

        // ========== GitHub ==========
        { label: 'GitHub', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'providers.github.token',
          label: 'GitHub Token',
          bottomHelpMessage: 'GitHub fine-grained PAT，建议权限：Contents / Issues / Pull requests 只读',
          component: 'InputPassword',
        },
        {
          field: 'providers.github.apiBase',
          label: 'API 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://api.github.com' },
        },
        {
          field: 'providers.github.webBase',
          label: 'Web 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://github.com' },
        },

        // ========== Gitee ==========
        { label: 'Gitee', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'providers.gitee.token',
          label: 'Gitee Token',
          bottomHelpMessage: 'Gitee 私人令牌，建议只给仓库 / Issue / PR 读权限',
          component: 'InputPassword',
        },
        {
          field: 'providers.gitee.apiBase',
          label: 'API 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://gitee.com/api/v5' },
        },
        {
          field: 'providers.gitee.webBase',
          label: 'Web 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://gitee.com' },
        },

        // ========== GitCode ==========
        { label: 'GitCode', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'providers.gitcode.token',
          label: 'GitCode Token',
          bottomHelpMessage: 'GitCode access token，建议只给仓库 / Issue / PR 读权限',
          component: 'InputPassword',
        },
        {
          field: 'providers.gitcode.apiBase',
          label: 'API 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://api.gitcode.com/api/v5' },
        },
        {
          field: 'providers.gitcode.webBase',
          label: 'Web 地址',
          component: 'Input',
          componentProps: { placeholder: 'https://gitcode.com' },
        },

        // ========== Gitea ==========
        { label: 'Gitea', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'providers.gitea.instances.default.baseUrl',
          label: '实例地址',
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
      ],

      getConfigData() {
        return getGitConfig()
      },

      setConfigData(data, { Result }) {
        try {
          const defaults = getGitConfig()
          const merged = { ...defaults }
          for (const schema of this.schemas) {
            if (!schema.field) continue
            const value = get(data, schema.field)
            if (value !== undefined) set(merged, schema.field, value)
          }
          fs.writeFileSync(userConfigPath, YAML.stringify(merged))
          return Result.ok({}, '保存成功~')
        } catch (error) {
          logger.error(`[Git-Plugin] 保存配置失败: ${error.message}`)
          return Result.error(error.message || '保存失败')
        }
      },
    },
  }
}