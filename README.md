# Git-Plugin

面向 Yunzai 的 Git 仓库助手，支持 GitHub、Gitee、GitCode、Gitea 四个平台。

Git-Plugin 可以查询仓库、Issue、PR、README，支持仓库订阅、轮询推送、Webhook 实时推送，以及 Git 仓库链接自动解析。平台实现按 Provider 分离，GitHub / Gitee / GitCode / Gitea 的 API、鉴权和地址规则互不混用。

## 功能

| 功能 | 说明 |
| --- | --- |
| 仓库查询 | 查看描述、Star、Fork、默认分支、更新时间 |
| Issue 查询 | 按编号查详情；只填仓库时列出开启 Issue 编号 |
| PR 查询 | 按编号查详情；只填仓库时列出开启 PR 编号 |
| README 查询 | 读取仓库 README |
| API 限流 | 查询 GitHub API rate limit |
| 仓库订阅 | 在群聊或私聊订阅仓库更新 |
| 轮询推送 | 定时检查新增 Issue / PR |
| Webhook 推送 | 接收平台 webhook 并推送到订阅会话 |
| 链接解析 | 自动解析 Git 仓库链接 |

## 支持平台

| 平台 | 默认 API | Provider |
| --- | --- | --- |
| GitHub | `https://api.github.com` | `model/providers/githubProvider.js` |
| Gitee | `https://gitee.com/api/v5` | `model/providers/giteeProvider.js` |
| GitCode | `https://api.gitcode.com/api/v5` | `model/providers/gitcodeProvider.js` |
| Gitea | `{baseUrl}/api/v1` | `model/providers/giteaProvider.js` |

## 安装

在 Yunzai 根目录执行：

```bash
git clone https://github.com/QingYingX-Bot/Git-Plugin.git plugins/Git-Plugin
cd plugins/Git-Plugin
npm install
```

安装后重启 Yunzai。

## 配置

默认配置：

```text
plugins/Git-Plugin/config/default_config/git.yaml
```

运行配置：

```text
plugins/Git-Plugin/config/config/git.yaml
```

首次运行会从默认配置复制一份到运行配置。真实 token、webhook secret、Gitea 实例地址写到运行配置里。

### Token 权限

| 平台 | 推荐权限 |
| --- | --- |
| GitHub | Fine-grained PAT，`Contents` / `Issues` / `Pull requests` 只读 |
| Gitee | 私人令牌，仓库 / Issue / PR 读权限 |
| GitCode | Access Token，仓库 / Issue / PR 读权限 |
| Gitea | Access Token，repository / issue 读权限 |

### Webhook 配置

```yaml
webhook:
  enabled: true
  host: "0.0.0.0"
  port: 6192
  path: "/git/webhook"
  secret: "your-secret"
  pushClosedEvents: false
  allowedEventTypes:
    - issues
    - pull_requests
```

Webhook URL：

```text
http://host:6192/git/webhook
```

有公网域名时填平台侧 Payload URL，例如：

```text
https://githook.example.com/git/webhook
```

默认只推送 Issues / PR 相关事件，并过滤 closed。事件列表和其他事件含义见 [WEBHOOK_EVENTS.md](WEBHOOK_EVENTS.md)。

## 快速开始

订阅一个 GitHub 仓库：

```text
#githubsub QingYingX-Bot/Git-Plugin
```

查询仓库：

```text
#githubrepo QingYingX-Bot/Git-Plugin
```

查询开启 Issue 编号：

```text
#githubissue QingYingX-Bot/Git-Plugin
```

查询某个 Issue：

```text
#githubissue QingYingX-Bot/Git-Plugin#1
```

查询开启 PR 编号：

```text
#githubpr QingYingX-Bot/Git-Plugin
```

## 通用命令

通用命令通过第一个参数指定平台。

| 命令 | 说明 |
| --- | --- |
| `#gitrepo github owner/repo` | 查询仓库 |
| `#gitissue github owner/repo#1` | 查询 Issue |
| `#gitissue github owner/repo` | 查询开启 Issue 编号列表 |
| `#gitpr github owner/repo#1` | 查询 PR |
| `#gitpr github owner/repo` | 查询开启 PR 编号列表 |
| `#gitreadme github owner/repo` | 查询 README |
| `#gitlimit` | 查询 API 限流 |
| `#gitsub github owner/repo` | 订阅仓库 |
| `#gitunsub github owner/repo` | 取消订阅仓库 |
| `#gitlist` | 查看当前会话订阅 |
| `#gitlist github` | 查看当前会话指定平台订阅 |
| `#gitdefault github owner/repo` | 设置当前会话默认仓库 |
| `#gitlink on` | 开启链接自动解析 |
| `#gitlink off` | 关闭链接自动解析 |

Gitea 通用命令需要带实例地址：

```text
#gitrepo gitea https://gitea.example.com owner/repo
#gitissue gitea https://gitea.example.com owner/repo#1
#gitpr gitea https://gitea.example.com owner/repo#1
#gitsub gitea https://gitea.example.com owner/repo
```

## 平台直达命令

平台直达命令使用完整平台名前缀。

| 平台 | 仓库 | Issue | PR | README | 订阅 |
| --- | --- | --- | --- | --- | --- |
| GitHub | `#githubrepo owner/repo` | `#githubissue owner/repo#1` | `#githubpr owner/repo#1` | `#githubreadme owner/repo` | `#githubsub owner/repo` |
| Gitee | `#giteerepo owner/repo` | `#giteeissue owner/repo#I12345` | `#giteepr owner/repo#1` | `#giteereadme owner/repo` | `#giteesub owner/repo` |
| GitCode | `#gitcoderepo owner/repo` | `#gitcodeissue owner/repo#1` | `#gitcodepr owner/repo#1` | `#gitcodereadme owner/repo` | `#gitcodesub owner/repo` |
| Gitea | `#gitearepo https://gitea.example.com owner/repo` | `#giteaissue https://gitea.example.com owner/repo#1` | `#giteapr https://gitea.example.com owner/repo#1` | `#giteareadme https://gitea.example.com owner/repo` | `#giteasub https://gitea.example.com owner/repo` |

只填仓库时，Issue / PR 命令会返回开启编号列表：

```text
#githubissue owner/repo
#githubpr owner/repo
```

编号连续时会压缩显示：

```text
1~4, 8, 10~12
```

## 订阅推送

订阅目标由命令发送位置决定：

| 发送位置 | 推送目标 |
| --- | --- |
| 群聊 | 当前群 |
| 私聊 | 当前好友 |

订阅数据按仓库 key 保存：

```text
github:owner/repo
gitee:owner/repo
gitcode:owner/repo
gitea:https://gitea.example.com:owner/repo
```

轮询配置：

```yaml
pollingEnabled: true
checkIntervalMinutes: 30
```

Webhook 实时推送需要在平台仓库页面添加 webhook。多个平台、多个仓库可以共用同一个插件 webhook URL；每个仓库需要在对应平台单独添加一次。

## 数据文件

运行数据写入 `plugins/Git-Plugin/data/`：

| 文件 | 内容 |
| --- | --- |
| `subscriptions.json` | 仓库订阅 |
| `defaultRepos.json` | 当前会话默认仓库 |
| `linkSettings.json` | 当前会话链接解析开关 |
| `lastCheck.json` | 轮询检查时间戳 |

`data/` 与 `config/config/` 默认被 git 忽略。

## 目录结构

```text
apps/                    命令入口
components/config.js     配置读取
model/providers/         平台 Provider
model/formatters/        消息格式化
model/repoParser.js      仓库参数解析
model/repoStore.js       订阅和默认仓库存储
model/pollingService.js  轮询推送
model/webhookServer.js   Webhook 接收
```

## 开发说明

新增平台时：

1. 新增 `model/providers/*Provider.js`
2. 在 `model/platform.js` 注册平台名和显示名
3. 在 `model/providers/index.js` 注册 Provider
4. 在命令层补充平台直达命令
5. 在 README 和 `WEBHOOK_EVENTS.md` 补充说明

平台 API 差异放在 Provider 内，命令层只解析消息并调用统一接口。
