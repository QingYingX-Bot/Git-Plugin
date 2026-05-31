# Webhook Events

本文档说明 Git-Plugin 的 webhook 事件过滤规则，以及常见 webhook 事件代表的含义。

## 当前推送策略

```yaml
webhook:
  pushClosedEvents: false
  allowedEventTypes:
    - issues
    - pull_requests
```

当前插件默认只推送 Issues / PR 相关事件。其他事件会被接收并过滤。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `pushClosedEvents` | `false` | 是否推送 Issues / PR 的 closed 事件 |
| `allowedEventTypes` | `issues`, `pull_requests` | 当前允许推送的事件类型 |

`allowedEventTypes` 当前支持：

| 值 | 含义 | 可用别名 |
| --- | --- | --- |
| `issues` | Issues 相关事件 | `issue` |
| `pull_requests` | PR / Merge Request 相关事件 | `pr`, `pull_request`, `merge_request`, `merge_requests` |

## 默认会推送

| 插件分类 | 平台事件名示例 | 触发场景 | 默认行为 |
| --- | --- | --- | --- |
| `issues` | `issues`, `Issue Hook` | 新建、重开、编辑、分配、打标签、设置里程碑等 Issue 事件 | 推送 |
| `issues` | `issue_comment`, `Note Hook` | Issue 下新增或修改评论 | 推送 |
| `pull_requests` | `pull_request`, `Merge Request Hook` | 新建、重开、更新、同步提交、请求评审、合并等 PR/MR 事件 | 推送 |
| `pull_requests` | `pull_request_review` | PR 评审提交、通过、要求修改等 | 推送 |
| `pull_requests` | `pull_request_review_comment`, `Note Hook` | PR 代码评论、PR 评论 | 推送 |

## 默认过滤的 Closed 事件

`pushClosedEvents: false` 时，下面这些关闭动作会过滤：

| 动作 | 常见来源 | 含义 |
| --- | --- | --- |
| `closed` | GitHub / Gitea Issues、Pull Request | Issue 或 PR 被关闭 |
| `close` | Gitee / GitCode Issue Hook、Merge Request Hook | Issue 或 MR 被关闭 |

需要推送关闭事件时：

```yaml
webhook:
  pushClosedEvents: true
```

## 其他常见事件列表

下面这些事件是平台可能发送的其他 webhook 事件。当前默认配置会过滤它们。

### 仓库与代码

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `push`, `Push Hook` | GitHub / Gitee / GitCode / Gitea | 分支收到 commit 推送 | 过滤 |
| `create` | GitHub / Gitea | 创建分支或标签 | 过滤 |
| `delete` | GitHub / Gitea | 删除分支或标签 | 过滤 |
| `tag_push`, `Tag Push Hook` | Gitee / GitCode | 标签创建、更新或删除 | 过滤 |
| `fork` | GitHub / Gitea | 仓库被 fork | 过滤 |
| `repository` | GitHub / Gitea | 仓库创建、删除、归档、改名、可见性变化等 | 过滤 |
| `public` | GitHub | 私有仓库转公开 | 过滤 |
| `gollum`, `Wiki Page Hook` | GitHub / Gitee / GitCode / Gitea | Wiki 页面创建、更新或删除 | 过滤 |
| `page_build` | GitHub | GitHub Pages 构建完成或失败 | 过滤 |

### Issue 与 PR

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `issues`, `Issue Hook` | GitHub / Gitee / GitCode / Gitea | Issue 创建、编辑、重开、关闭、分配、标签变化等 | 推送，closed 默认过滤 |
| `issue_comment` | GitHub / Gitea | Issue 评论；GitHub 中 PR 普通评论也会走这个事件 | 推送 |
| `pull_request`, `Merge Request Hook` | GitHub / Gitee / GitCode / Gitea | PR/MR 创建、编辑、同步提交、重开、关闭、合并等 | 推送，closed 默认过滤 |
| `pull_request_review` | GitHub | PR review 提交、通过、要求修改、撤销 | 推送 |
| `pull_request_review_comment` | GitHub / Gitea | PR diff 行评论 | 推送 |
| `pull_request_review_thread` | GitHub | PR review 线程解决或取消解决 | 推送 |
| `Note Hook` | Gitee / GitCode | Issue、MR、Commit 等对象的评论 | Issue / MR 评论推送，其他评论过滤 |

### 协作对象

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `label` | GitHub | 标签创建、编辑、删除 | 过滤 |
| `milestone` | GitHub | 里程碑创建、关闭、编辑、删除 | 过滤 |
| `project`, `project_card`, `project_column` | GitHub | Projects 看板、卡片、列变化 | 过滤 |
| `member` | GitHub | 仓库协作者添加、移除、权限变化 | 过滤 |
| `team_add` | GitHub | 团队获得仓库权限 | 过滤 |

### 发布与制品

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `release`, `Release Hook` | GitHub / Gitee / GitCode / Gitea | Release 发布、编辑、删除、预发布等 | 过滤 |
| `package`, `registry_package` | GitHub / Gitea | 包发布、更新、删除 | 过滤 |
| `deployment` | GitHub | 创建部署 | 过滤 |
| `deployment_status` | GitHub | 部署状态变化 | 过滤 |

### CI 与检查

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `workflow_run` | GitHub | GitHub Actions workflow 运行开始、完成等 | 过滤 |
| `workflow_job` | GitHub | GitHub Actions job 排队、运行、完成等 | 过滤 |
| `check_run` | GitHub | 单个检查运行创建、完成、重跑等 | 过滤 |
| `check_suite` | GitHub | 一组检查运行请求、完成等 | 过滤 |
| `status`, `commit_status` | GitHub / GitLab 风格平台 | commit 状态变更，例如 CI 成功或失败 | 过滤 |
| `Pipeline Hook` | GitCode / GitLab 风格平台 | CI pipeline 状态变化 | 过滤 |
| `Job Hook` | GitCode / GitLab 风格平台 | CI job 状态变化 | 过滤 |

### 讨论与通知

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `discussion` | GitHub | Discussion 创建、编辑、关闭、转移等 | 过滤 |
| `discussion_comment` | GitHub | Discussion 评论变化 | 过滤 |
| `watch`, `star` | GitHub / Gitee / Gitea | 仓库被 star / watch | 过滤 |
| `sponsorship` | GitHub | Sponsor 状态变化 | 过滤 |

### 安全与规则

| 事件名 | 常见平台 | 含义 | 当前默认行为 |
| --- | --- | --- | --- |
| `dependabot_alert` | GitHub | Dependabot 安全告警创建、修复、关闭等 | 过滤 |
| `code_scanning_alert` | GitHub | Code scanning 告警变化 | 过滤 |
| `secret_scanning_alert` | GitHub | Secret scanning 告警变化 | 过滤 |
| `repository_advisory` | GitHub | 仓库安全公告变化 | 过滤 |
| `branch_protection_rule` | GitHub | 分支保护规则变化 | 过滤 |
| `repository_ruleset` | GitHub | 仓库 ruleset 变化 | 过滤 |

## 四个平台的 webhook 头

| 平台 | 事件头 | Secret / 签名 |
| --- | --- | --- |
| GitHub | `x-github-event` | `x-hub-signature-256` |
| Gitee | `x-gitee-event` | `x-gitee-token` |
| GitCode | `x-gitcode-event` | `x-gitcode-signature-256`、`x-gitcode-token`、`x-gitlab-token` |
| Gitea | `x-gitea-event` / `x-gogs-event` | `x-gitea-signature`、`x-gogs-signature`、`x-gitea-token` |

## 推荐平台勾选

只想推送 Issues 和 PR 时，平台 webhook 页面建议勾选：

| 类型 | 建议 |
| --- | --- |
| Issues | 勾选 |
| Pull requests / Merge requests | 勾选 |
| Issue comments / Notes | 需要评论推送时勾选 |
| Pull request comments / Reviews | 需要 PR 评论或评审推送时勾选 |
| Push | 不勾选 |
| Stars / Forks / Releases / Workflows | 不勾选 |

GitHub 选择 `Send me everything` 时，插件仍会按 `allowedEventTypes` 过滤非 Issues / PR 事件。
