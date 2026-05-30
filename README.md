# Git-Plugin

Git-Plugin 是面向 Yunzai 的 Git 仓库助手，支持 GitHub、Gitee、GitCode、Gitea 四个平台。

插件按平台拆分 Provider，命令层只负责解析消息和调用统一接口。平台 API、鉴权、README 读取和 URL 规则分别放在各自 Provider 内，避免不同平台逻辑互相影响。

## 支持平台

| 平台 | Provider | 默认 API Base | 说明 |
| --- | --- | --- | --- |
| GitHub | `model/providers/githubProvider.js` | `https://api.github.com` | 支持 OpenGraph 卡片 |
| Gitee | `model/providers/giteeProvider.js` | `https://gitee.com/api/v5` | 使用 `access_token` |
| GitCode | `model/providers/gitcodeProvider.js` | `https://api.gitcode.com/api/v5` | 支持 Bearer、`PRIVATE-TOKEN`、`access_token` |
| Gitea | `model/providers/giteaProvider.js` | `{baseUrl}/api/v1` | 需要配置实例地址 |

## 功能

- 仓库信息查询
- Issue 查询
- PR 查询
- README 查询
- 仓库订阅、取消订阅、订阅列表
- 订阅轮询推送
- Git 仓库链接自动解析
- Webhook 接收与订阅推送
- GitHub API 限流查询

## 通用命令

通用命令通过第一个参数指定平台。

```text
#gitrepo github owner/repo
#gitrepo gitee owner/repo
#gitrepo gitcode owner/repo
#gitrepo gitea https://gitea.example.com owner/repo

#gitissue github owner/repo#1
#gitissue gitee owner/repo#I12345
#gitissue gitcode owner/repo#1
#gitissue gitea https://gitea.example.com owner/repo#1

#gitpr github owner/repo#1
#gitreadme github owner/repo
#gitlimit

#gitsub github owner/repo
#gitunsub github owner/repo
#gitlist
#gitlist github

#gitdefault github owner/repo
#gitlink on
#gitlink off
```

## 平台直达命令

平台直达命令使用完整平台名作为前缀。

```text
#githubrepo owner/repo
#githubissue owner/repo#1
#githubpr owner/repo#1
#githubreadme owner/repo
#githublimit
#githubsub owner/repo
#githubunsub owner/repo
#githubdefault owner/repo

#giteerepo owner/repo
#giteeissue owner/repo#I12345
#giteepr owner/repo#1
#giteereadme owner/repo
#giteesub owner/repo
#giteeunsub owner/repo
#giteedefault owner/repo

#gitcoderepo owner/repo
#gitcodeissue owner/repo#1
#gitcodepr owner/repo#1
#gitcodereadme owner/repo
#gitcodesub owner/repo
#gitcodeunsub owner/repo
#gitcodedefault owner/repo

#gitearepo https://gitea.example.com owner/repo
#giteaissue https://gitea.example.com owner/repo#1
#giteapr https://gitea.example.com owner/repo#1
#giteareadme https://gitea.example.com owner/repo
#giteasub https://gitea.example.com owner/repo
#giteaunsub https://gitea.example.com owner/repo
#giteadefault https://gitea.example.com owner/repo
```

## 配置

默认配置文件：

```text
plugins/Git-Plugin/config/default_config/git.yaml
```

首次运行会复制到：

```text
plugins/Git-Plugin/config/config/git.yaml
```

配置示例：

```yaml
defaultPlatform: github
autoResolveLinks: true
pollingEnabled: true
checkIntervalMinutes: 30
useLowercaseRepo: true
requestTimeoutMs: 15000

providers:
  github:
    token: ""
    apiBase: "https://api.github.com"
    webBase: "https://github.com"
  gitee:
    token: ""
    apiBase: "https://gitee.com/api/v5"
    webBase: "https://gitee.com"
  gitcode:
    token: ""
    apiBase: "https://api.gitcode.com/api/v5"
    webBase: "https://gitcode.com"
  gitea:
    instances:
      default:
        baseUrl: "https://gitea.example.com"
        token: ""

webhook:
  enabled: false
  host: "0.0.0.0"
  port: 6192
  path: "/git/webhook"
  secret: ""
```

## 数据文件

运行数据写入 `plugins/Git-Plugin/data/`：

| 文件 | 内容 |
| --- | --- |
| `subscriptions.json` | 仓库订阅 |
| `defaultRepos.json` | 会话默认仓库 |
| `linkSettings.json` | 会话链接解析开关 |
| `lastCheck.json` | 轮询时间戳 |

订阅 key 格式：

```text
github:owner/repo
gitee:owner/repo
gitcode:owner/repo
gitea:https://gitea.example.com:owner/repo
```

## Webhook

启用配置：

```yaml
webhook:
  enabled: true
  host: "0.0.0.0"
  port: 6192
  path: "/git/webhook"
  secret: "your-secret"
```

Webhook 地址：

```text
http://host:6192/git/webhook
```

平台识别规则：

| 平台 | 事件头 |
| --- | --- |
| GitHub | `x-github-event` |
| Gitee | `x-gitee-event` |
| GitCode | `x-gitcode-event` |
| Gitea | `x-gitea-event` |

GitHub 使用 `x-hub-signature-256` 校验签名。其他平台使用 `x-gitee-token`、`x-gitcode-token`、`x-gitea-token` 或 `?secret=` 与配置中的 `webhook.secret` 比对。

## 维护边界

- 平台 API 差异放在 `model/providers/*Provider.js`
- 字段归一化放在 `model/normalize.js`
- 命令参数解析放在 `model/repoParser.js`
- 订阅和默认仓库存储放在 `model/repoStore.js`
- 轮询推送放在 `model/pollingService.js`
- Webhook 接收放在 `model/webhookServer.js`

新增平台时，先新增 Provider，再在 `model/platform.js` 和 `model/providers/index.js` 注册平台。
