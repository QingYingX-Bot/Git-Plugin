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
| 帮助图 | 使用独立模板渲染插件命令帮助 |
| 仓库订阅 | 在群聊或私聊订阅仓库更新 |
| 轮询推送 | 定时检查新增 Issue / PR |
| 仓库更新卡片 | 定时检查分支 commit，推送带作者、分支、变更统计、Release / Tag 的更新卡片 |
| Webhook 推送 | 接收平台 webhook 并推送到订阅会话 |
| 链接解析 | 自动解析 Git 仓库链接，并生成仓库卡片图 |
| 插件更新 | 支持 `#gt更新` / `#git更新` 快捷更新 Git-Plugin |

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

### 网络代理

访问 GitHub 慢或经常出现 TLS 建连失败时，可以在运行配置中填写代理：

```yaml
proxy: "http://127.0.0.1:7890"
```

代理会用于平台 API 请求、README / Issue / PR 正文图片下载，以及仓库更新卡片的作者头像下载。

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
    - push
```

Webhook URL：

```text
http://host:6192/git/webhook
```

有公网域名时填平台侧 Payload URL，例如：

```text
https://githook.example.com/git/webhook
```

默认推送 Issues / PR / Push 相关事件，并过滤 closed。事件列表和其他事件含义见 [WEBHOOK_EVENTS.md](WEBHOOK_EVENTS.md)。

### 仓库卡片

仓库查询和链接解析支持仓库卡片图。Gitee、GitCode、Gitea 链接解析默认使用插件内置模板渲染仓库卡片。GitHub 链接解析默认使用官方 OpenGraph 图片，也可以切换到统一模板。
内置模板会优先显示仓库所属账号/组织头像，平台标识使用本地 SVG 图标。
Issue / PR 详情和开启编号列表使用插件内置模板渲染为图片，渲染失败时自动回落文本。
README 查询使用插件内置模板渲染 Markdown 图片，渲染失败时自动回落文本。

```yaml
card:
  githubMode: "opengraph"
```

可选值：

| 值 | 说明 |
| --- | --- |
| `opengraph` | GitHub 使用官方 OpenGraph 图片，其它平台使用内置模板 |
| `template` | 四个平台都使用内置模板 |

### 仓库更新卡片

commit 轮询推送使用 `resources/repo-update-card.html` 渲染卡片图，字体使用 `resources/fonts/HarmonyOS_SansSC_Bold.ttf`。卡片会显示平台、仓库、作者头像、分支、commit、文件变更统计和 commit 正文首段，并支持 `light` / `dark` 两种主题。

当最新 commit 命中 Tag 或 Release 时，卡片会补充对应版本信息。检测到分支回退后再次更新时，会合并显示为“仓库回退更新”，并在同一张图里展示回退 commit 和更新 commit。

## 快速开始

订阅一个 GitHub 仓库：

```text
#githubsub QingYingX-Bot/Git-Plugin
```

订阅多个仓库：

```text
#githubsub owner/repo,owner2/repo2，owner3/repo3、owner4/repo4
#gitsub github owner/repo,owner2/repo2
```

多个仓库可使用 `,`、`，`、`、` 分隔。

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
| `#gitsub github owner/repo,owner2/repo2` | 订阅一个或多个仓库 |
| `#gitunsub github owner/repo` | 取消订阅仓库 |
| `#gitlist` | 查看当前会话订阅 |
| `#gitlist github` | 查看当前会话指定平台订阅 |
| `#gitdefault github owner/repo` | 设置当前会话默认仓库 |
| `#gitlink on` | 开启链接自动解析 |
| `#gitlink off` | 关闭链接自动解析 |
| `#gt帮助` | 查看 Git-Plugin 帮助图 |
| `#gt更新` / `#git更新` | 更新 Git-Plugin |
| `#gt强制更新` / `#git强制更新` | 强制更新 Git-Plugin |
| `#gt静更新` / `#git静更新` | 静默更新 Git-Plugin |

Gitea 通用命令需要带实例地址：

```text
#gitrepo gitea https://gitea.example.com owner/repo
#gitissue gitea https://gitea.example.com owner/repo#1
#gitpr gitea https://gitea.example.com owner/repo#1
#gitsub gitea https://gitea.example.com owner/repo,owner2/repo2
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

### 推送模式

| 配置 | 触发方式 | 推送内容 | 推送目标 |
| --- | --- | --- | --- |
| `pollingEnabled` | 插件定时拉平台 API | 新增 Issue / PR | `subscriptions.json` 中的订阅会话 |
| `repoUpdate` | 插件定时拉最新 commit | 分支 commit 更新 | `repoUpdate.list.groups/friends` |
| `webhook` | 平台实时回调插件接口 | Issues / PR / Push | `subscriptions.json` 中的订阅会话 |

`repoUpdate` 适合没有公网 webhook 地址、只想给固定群或好友推 commit 更新的场景。`webhook` 适合实时推送，平台仓库页面需要添加 webhook。多个平台、多个仓库可以共用同一个插件 webhook URL；每个仓库需要在对应平台单独添加一次。同一仓库同时启用 `repoUpdate` 和 webhook 的 `push` 事件时，commit 更新会重复提醒。

commit 轮询配置示例：

```yaml
repoUpdate:
  enabled: true
  cron: "0 */30 * * * *"
  theme: "light"
  list:
    - groups:
        - "1070221868"
      friends: []
      autoScan: false
      exclude: []
      repos:
        - platform: github
          repo: qingyingx-bot/git-plugin
      note: "commit 更新轮询"
```

## 数据文件

运行数据写入 `plugins/Git-Plugin/data/`：

| 文件 | 内容 |
| --- | --- |
| `subscriptions.json` | 仓库订阅 |
| `defaultRepos.json` | 当前会话默认仓库 |
| `linkSettings.json` | 当前会话链接解析开关 |
| `lastCheck.json` | 轮询检查时间戳 |
| `lastSha.json` | commit 更新检测的最新 SHA |
| `shaHistory.json` | commit 更新检测的最近 SHA 记录 |
| `pendingRewrite.json` | 分支回退后等待合并推送的记录 |

`data/` 与 `config/config/` 默认被 git 忽略。

## 目录结构

```text
apps/                    命令入口
apps/update.js           插件更新快捷命令
components/config.js     配置读取
resources/help.html       帮助图模板
resources/issue-pr-card.html Issue / PR 查询图模板
resources/readme-card.html README 查询图模板
resources/repo-card.html  仓库卡片模板
resources/repo-update-card.html commit 更新卡片模板
resources/fonts/          卡片字体资源
resources/icons/          平台 SVG 图标
model/providers/         平台 Provider
model/formatters/        消息格式化
model/releaseInfo.js     Release / Tag 信息读取
model/repoParser.js      仓库参数解析
model/repoStore.js       订阅和默认仓库存储
model/pollingService.js  轮询推送
model/repoUpdateService.js commit 更新检测
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
