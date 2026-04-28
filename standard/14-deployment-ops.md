# 部署与运维规范

## 目标架构

Round1 采用“两层架构”：

| 层级         | 组件                                           | 说明                                            |
| ------------ | ---------------------------------------------- | ----------------------------------------------- |
| 生产运行时   | Caddy + Express API + Redis + Postgres         | 在线考试、后台 API、静态资源；不部署 cpp-runner |
| 离线内容环境 | generate / judge / cpp-runner / content worker | 内容生产、校验、bundle 构建；不要求 24x7        |

生产 runtime worker 只允许承载考试会话支持型任务，例如 auto-submit；不得消费 generation 或 sandbox verify。

## 运行时工具链基线

- Node.js 标准基线为 `>=24.15.0`。
- npm 标准基线为 `>=11.12.1`。
- 所有 `package.json` 的 `engines`、lockfile 顶层 package 元数据、Docker/部署文档中的 Node/npm 版本口径必须与本节同步。
- 需要更高版本时，先更新本节，再同步 `package.json`、lockfile、Dockerfile、部署 runbook 与 plan/reference 文档；不得只改其中一处。

## 部署前检查

- `npm run lint`
- `npm run test`
- `npm run build --workspace=client`
- `npm run build --workspace=server`
- `npm run migrate:status`
- 数据库备份完成并校验可读。
- `.env` 权限为 600。
- Sentry release/environment 配置正确。
- 静态资源缓存策略明确。

## 上线准备评审

上线前应做一次轻量 readiness review，重点看能否安全失败和快速恢复：

- 本次变更属于哪类：docs-only、frontend-only、api-compatible、stateful、ops/security。
- 是否有明确 commit/tag、迁移清单、配置差异和负责人。
- 是否知道第一条 smoke 失败时怎么停止继续发布。
- 是否知道回滚后哪些缓存、worker、配置或前端静态资源需要同步处理。
- 是否有观察窗口；stateful 与 ops/security 变更不应在无人观察时上线。

readiness review 可以写在 PR、发布记录或 `docs/plans/YYYY-MM-DD-release-<topic>.md`，不要求复杂模板，但必须能被排障者找到。

## 变更类型

不同变更使用不同上线强度，不把所有发布都做成重流程，也不把高风险发布当普通改动。

| 类型           | 示例                                | 必须额外确认                             |
| -------------- | ----------------------------------- | ---------------------------------------- |
| docs-only      | standard/plan/README                | 链接、路径、术语                         |
| frontend-only  | 页面、组件、样式                    | build、视觉/响应式、可达性、打印相关页面 |
| api-compatible | 新增可选字段、新只读接口            | OpenAPI、integration test、前端兼容      |
| stateful       | migration、状态机、权限、导入 apply | 备份、回滚/恢复、审计、并发测试          |
| ops/security   | Caddy、PM2、cookie、CSP、secret     | smoke、回滚、访问控制、监控观察          |

stateful 与 ops/security 不应在没有观察窗口的情况下临近无人值守时段上线。

## 生产上线步骤

1. 拉取代码。
2. 安装依赖，仅在 lockfile 变化时执行。
3. 构建 client/server。
4. 备份数据库。
5. 执行兼容迁移。
6. 平滑重启 API。
7. 检查 `/api/v1/health`。
8. 验证登录、配置端点、考试 catalog、Admin 关键页。
9. 观察日志和 Sentry。

## 渐进发布

当前 Round1 规模较小，可以不引入复杂发布平台，但仍应遵循渐进原则：

- 先在 local/test 完成迁移和 smoke。
- 生产执行前确认备份和回滚点。
- API 重启后先验证只读健康，再验证写路径。
- 高风险功能优先通过 feature flag、Admin 限定入口或小范围数据启用。
- 上线后保留观察窗口；观察项包括 5xx、登录失败、autosave、submit、Admin audit。

禁止在上线窗口内同时引入大范围 UI 重设、DB 不可逆迁移和部署拓扑变化。

## 观察窗口

发布后的观察窗口按风险决定：

| 风险           | 观察重点                                                 | 建议时长   |
| -------------- | -------------------------------------------------------- | ---------- |
| frontend-only  | 首屏、关键路由、Sentry 前端异常、静态资源 404            | 15-30 分钟 |
| api-compatible | 5xx、p95、错误码分布、前端调用失败                       | 30-60 分钟 |
| stateful       | migration、autosave/submit、import/admin audit、DB locks | 1-2 小时   |
| ops/security   | 登录、cookie/CSRF、TLS/CSP、邮件/OIDC、Sentry release    | 1-2 小时   |

观察窗口内发现 Page/SEV1 信号，优先止损和回滚，不继续叠加修复性发布，除非已确认回滚风险更高。

## 回滚

- 代码回滚必须回到明确 release tag 或 commit。
- 如果迁移可逆，按迁移工具回滚。
- 如果迁移不可逆，按最近备份恢复到临时库验证后再恢复生产。
- 回滚后必须验证健康检查、登录、考试恢复、Admin 入口。

## 回滚策略矩阵

| 变更             | 首选回滚                         | 注意                                    |
| ---------------- | -------------------------------- | --------------------------------------- |
| 前端静态资源     | 回滚到上一构建或 tag             | HTML 不长期缓存，避免旧 JS 找不到资源   |
| 后端代码         | 回滚 commit/tag 并重启           | 确认新 DB 字段是否仍被旧代码忽略        |
| 可逆 migration   | 执行 down 或补偿 migration       | 先备份，先在临时库演练                  |
| 不可逆 migration | 从备份恢复或写补偿脚本           | 必须先评估数据损失窗口                  |
| 配置变更         | 恢复 env/app_settings            | 记录生效时间，验证 Redis config refresh |
| 内容导入         | archive/copy-version，不硬删历史 | 保留 import batch 和 checksum           |

## 数据库备份

- 使用 `pg_dump` 逻辑备份。
- 备份文件权限 600。
- 定期执行 `pg_restore` 到临时库验证。
- 不可逆迁移前必须有新备份。

## Redis 运维

- 禁止 `FLUSHDB`。
- 按前缀清理：`sess:*`、`bull:*`、`rl:*`、`cfg:*`。
- Redis 断开时应演练降级：已登录用户重新登录，核心答题数据不丢。

## 安全加固

- SSH 禁用密码登录，启用 fail2ban 或等价防护。
- UFW/iptables 只开放 80/443/SSH；Postgres 仅内网。
- 服务使用非 root 用户。
- 自动安全更新按服务器策略开启。
- Cloudflare Full Strict + Caddy TLS 上线前验证。
- PostgreSQL 应用用户最小权限，不使用 superuser。

## 离线内容环境

- 可独立部署在开发机、CI 或内容机。
- cpp-runner 只接受本机/内网访问。
- contentWorker 不属于生产运行时。
- 内容产物必须输出到 [09-offline-content-artifacts.md](09-offline-content-artifacts.md) 规定路径。

## 离线到生产交接

离线内容进入生产前必须有交接记录：

- `runId`、bundle 路径、checksum manifest。
- 生成/校验工具版本或 commit。
- sandbox/judge/人工复核结果。
- dry-run summary 与错误报告。
- apply batch id 与发布对象。
- 回滚方式：archive、copy-version 或重新导入。

生产环境只接收已校验资产，不重新运行 LLM 生成或 cpp-runner 校验。

## 健康检查

仓库内提供统一 `scripts/healthcheck.ts`，部署验证应优先使用该脚本，再配合必要的人工业务验收。脚本必须覆盖并明确区分：

- API readiness，并从 `/api/v1/health` 汇总 DB / Redis 状态。
- 前端静态文件可访问，需通过 `ROUND1_HEALTHCHECK_FRONTEND_URL` 或 `--frontend-url` 显式开启。
- 邮件 provider 与 Turnstile 配置 smoke，默认跳过，需通过 `ROUND1_HEALTHCHECK_INCLUDE_EXTERNAL=1` 或 `--include-external` 开启。
- 离线内容环境 runner/content worker smoke，默认跳过，需通过 `ROUND1_HEALTHCHECK_INCLUDE_OFFLINE=1` 或 `--include-offline` 开启。
- PM2 进程状态，默认跳过，需通过 `ROUND1_HEALTHCHECK_PM2=1` 或 `--pm2` 开启。

健康检查分层：

- `liveness`：进程是否活着。
- `readiness`：DB/Redis/静态资源是否可用。
- `business smoke`：登录、配置、选卷、autosave/submit、Admin step-up 是否可用。
- `external smoke`：邮件、Turnstile、OIDC、Sentry release 是否可用。

生产负载均衡或 Caddy 只应依赖轻量 readiness；business/external smoke 用于上线验收，不应每秒打外部服务。

## 事故响应

生产事故处理顺序：

1. 判断是否影响考试作答和数据保存。
2. 冻结相关发布。
3. 保留日志、审计、DB 快照。
4. 回滚或降级。
5. 写复盘并补测试/监控/规范。

## 运行演练

以下演练不要求每次发布都做，但必须在里程碑或上线前完成并记录：

- DB 备份恢复到临时库。
- Redis 断开或重启后的登录/考试恢复。
- PM2/API 优雅停机与重启。
- Caddy/TLS/Cloudflare Full Strict 验证。
- 邮件、OIDC、Turnstile、Sentry smoke。
- prebuilt paper pool 为空时前端和 API 的降级文案。

演练失败不是文档问题，应进入 backlog 并标注上线风险。

## 环境矩阵

| 环境               | 组件                                 | 说明                              |
| ------------------ | ------------------------------------ | --------------------------------- |
| local              | client/server/Redis/Postgres 可本机  | 本地 HTTPS，便于 cookie/OIDC 测试 |
| test               | 测试 DB/Redis 或 mock                | 不依赖真实外部服务                |
| offline-content    | scripts/contentWorker/cpp-runner/LLM | 生成和校验内容                    |
| production-runtime | Caddy/API/Redis/Postgres             | 在线服务，不跑内容生成            |

## Caddy 与静态资源

- Caddy 负责 TLS 和反代。
- API 与静态资源同源部署时无需 CORS。
- 前端字体使用同源 `/font/*`，Caddy/Vite 必须把该路径代理到 `R2_PUBLIC_BASE_URL/font/*`；不要让浏览器直接跨域请求 R2 字体，除非 R2 已配置正确 CORS。
- `client/dist` 静态资源应有长期缓存；HTML 不应长期缓存。
- Cloudflare Full Strict 上线前验证。

## PM2 / 进程

当前仓库提供版本化 `ecosystem.config.cjs`：

- API 使用 cluster 模式，默认 2 实例，可通过 `ROUND1_PM2_API_INSTANCES` 调整。
- runtime worker 默认生产关闭，仅在明确设置 `ROUND1_PM2_ENABLE_RUNTIME_WORKER=1` 时启用。
- content worker 只在 offline-content 环境，通过 `ROUND1_PM2_ENABLE_CONTENT_WORKER=1` 显式启用。
- 每个进程设置明确 `ROUND1_PROCESS_TYPE`，数据库连接层据此设置 `application_name`。
- 优雅停机先停止接新请求，再关闭 DB/Redis；PM2 配置使用 `kill_timeout: 35000` 对齐 API 30s graceful shutdown。

## 发布批次记录

每次上线记录：

- commit/tag。
- 迁移列表。
- 配置变化。
- 操作者。
- 备份位置。
- smoke 结果。
- 观察窗口结果。

建议记录位置为 `docs/plans/YYYY-MM-DD-release-<topic>.md`、issue、PR 描述或运维台账，但必须能被后续排障者找到。

发布记录完成后，应同步关闭或更新对应 backlog 项。若发布实际行为偏离原计划，优先更新 `plan/step-*` 或 `docs/plans/*followup*` 的当前对齐说明。

## 灾难恢复目标

最低要求：

- 有最近可恢复 DB 备份。
- 能在临时库验证 restore。
- 能快速回滚代码到上一个 tag。
- 内容资产可从 `papers/**` 和 `artifacts/**` 重新导入或追溯。

## 上线冻结条件

出现以下情况禁止上线：

- 无 DB 备份。
- migration 序号冲突。
- auth/security 测试失败。
- 考试 runtime integration 失败。
- 生产 secret 缺失或权限不正确。
- prebuilt paper pool 为空且影响目标考试类型。
- 关键 smoke 无法执行且没有人工替代验证。
- 无法定位上一可回滚 tag/commit。
