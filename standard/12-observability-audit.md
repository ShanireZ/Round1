# 可观测性与审计规范

## 目标

任何线上问题、内容质量问题、权限变更、导入结果、LLM 成本异常，都必须能通过日志、审计记录和数据库状态追溯到原因。

## 观测原则

- 先定义要回答的问题，再决定日志、指标、审计或报告字段。
- 用户影响优先于进程状态；“服务活着”不等于“考试可继续”。
- 高风险路径必须可关联：request id、actor、target、error code、batch/runId、commit/release。
- 观测不能泄密。能用 hash、摘要、计数和关联 ID 解决的问题，不记录原文。
- 告警必须能推动行动；无人处理、无阈值、无 runbook 的噪声不应升级为 Page。

## 日志

- 后端使用 pino/pino-http。
- 每个请求应有 method、path、status、latency、request id 或可关联字段。
- 5xx 必须记录 error stack；生产响应不得暴露 stack。
- 4xx 只记录必要上下文，不记录敏感输入。
- 日志中禁止出现密码、验证码、session id、CSRF token、API key、TOTP secret。

日志 message 应稳定、短、可搜索。业务差异放在结构化字段里，不靠自然语言拼接。

## 信号选择

参考云原生运维中“不同信号服务不同目的”的原则，Round1 不追求把所有信息都打进日志。

| 信号 | 适合回答 | Round1 用途 |
| --- | --- | --- |
| Metrics | 是否异常、趋势如何 | 5xx、p95、autosave 成功率、导入成功率、LLM 成本 |
| Logs | 单次请求发生了什么 | requestId、errorCode、状态迁移上下文 |
| Audit | 谁在何时改变了什么 | Admin、auth、import、review、配置变更 |
| Traces | 跨服务慢在哪里 | API -> DB/Redis/外部 provider，后续可引入 |
| Reports | 内容/批次质量如何 | `artifacts/reports/**`、导入错误报告 |

能用指标告警的不要靠人工读日志。需要追责或合规的必须写审计，不能只写普通日志。

## Sentry

- 生产需配置 release、environment、采样率、source map 策略。
- Sentry 事件必须过滤 PII 与 secret。
- 前后端都应捕获未处理异常。
- 用户可恢复错误优先用 toast/form error，不应全部上报为异常。

## 审计表

必须审计的领域：

- auth audit：登录、失败、密码重置、Passkey/TOTP、OIDC bind/unbind。
- admin audit：角色、设置、内容状态、危险操作。
- import batches：bundle dry-run/apply、checksum、summary、raw metadata。
- question reviews：AI/人工审核状态和备注。
- llm provider logs：provider/model/tokens/latency/cost/error。

## 审计字段

审计记录至少包含：

- `actor_user_id` 或 system actor。
- `target_type`、`target_id`。
- `action`。
- `before_json` / `after_json` 或摘要。
- `request_id`、`ip_hash`、`user_agent_hash`（按隐私要求处理）。
- `created_at`。

## 指标与健康检查

关键指标：

- API 5xx rate、p95 latency。
- 登录/注册失败率。
- Redis 可用性。
- DB 连接池使用率。
- autosave 成功率、nonce conflict 数。
- auto-submit delayed job 与 cron fallback 数。
- prebuilt paper 可用库存。
- import success/reject 数。
- LLM tokens/cost/error rate。

健康检查：

- `/api/v1/health` 返回 API 基础健康。
- 邮件、Turnstile、OIDC、cpp-runner/contentWorker 需要独立验收，不混进生产 runtime health。

健康检查不得触发写操作、发送真实邮件、调用真实 LLM 或修改业务状态。需要外部服务 smoke 时应放在部署验收或 runbook 中单独执行。

## 业务健康模型

技术健康不等于业务健康。最小业务健康应覆盖：

- 每个启用 `exam_type + difficulty` 至少有可用 published prebuilt paper。
- active attempts 能恢复，autosave 冲突率在可解释范围。
- auto-submit delayed job 与 cron fallback 都有成功记录。
- Admin import 最近批次失败率没有持续异常。
- Coach assignment 报表只统计 assignment attempts。
- 邮件 challenge、OIDC callback、Passkey 登录 smoke 在上线前可验证。

健康看板应把“服务活着”和“考试可继续”分开展示。

业务健康指标应尽量按 exam_type、difficulty、角色和环境拆分。聚合总数正常不能掩盖某个考试类型无卷、某个角色入口失败或某个导入队列长期失败。

## 告警

应该告警：

- 连续 5xx 或 p95 latency 异常。
- DB/Redis 连接失败。
- prebuilt paper pool 某考试类型/难度为空。
- import apply 失败率异常。
- Admin role/settings 高频变化。
- LLM 成本突增或 provider 全部失败。

告警阈值应有初始值和复核机制。上线早期可以偏保守，但每次噪声告警都应调整规则或补上下文，避免团队学会忽略告警。

## 告警分级

| 级别 | 触发 | 响应 |
| --- | --- | --- |
| Page | 考试作答、登录、权限、数据保存受影响 | 立即处理，可回滚或降级 |
| Ticket | 内容导入失败、某类预制卷不足、成本异常 | 当日或下个工作日处理 |
| Report | 趋势变差、容量接近阈值、文档漂移 | 进入维护 backlog |

不把“需要人判断才知道是否严重”的日志邮件当 Page。Page 必须附带动作建议或 runbook 链接。

## 数据保留

- 审计日志保留周期按安全与隐私策略设定。
- LLM 原始 prompt/response 如包含敏感或版权风险内容，默认不长期保存全文；保存 hash、摘要和必要诊断字段。
- import batch raw checksum 必须保留，raw bundle 可按存储策略归档。

保留策略必须区分排障价值、审计价值和隐私成本。普通请求日志可以缩短保留，Admin 审计、导入批次、发布记录和关键内容报告应长期可追溯。

## 采样与成本控制

- 5xx、权限拒绝、状态迁移失败、Admin 敏感操作不得采样丢弃。
- 2xx 普通请求可按比例采样，但关键计数必须通过 metrics 保留。
- 大对象、raw bundle、prompt/response 全文默认不进入应用日志。
- Sentry 采样率调整必须记录原因和观察窗口。
- 日志保留期和索引字段应定期复核，避免为了“以后可能用”无限增长。

## 排障要求

每个生产事故复盘必须包含：

- 时间线。
- 用户影响范围。
- 根因。
- 哪条监控/日志发现或未发现。
- 修复与回归测试。
- 规范或计划是否需要更新。

排障时优先保护现场：记录 release、配置、错误码、相关 request id、导入批次或 runId，再决定回滚、降级或修复。不要在未定位前清理 Redis、删除 batch 或覆盖资产。

## Runbook 要求

每个 Page 级告警必须能找到对应处理步骤，至少写清：

- 如何确认影响范围。
- 查询哪些日志、审计表、指标或 batch。
- 是否允许降级、暂停入口或回滚。
- 哪些操作需要先备份或冻结发布。
- 修复后做哪些 smoke。

如果还没有版本化 runbook，可以先写在 `docs/plans/*-followup.md` 或部署记录中，但不能只存在个人记忆里。

Runbook 不需要长，但必须可执行。每个危险命令前应写清前置检查和恢复方式；涉及数据库、Redis、导入资产、配置变更时，默认先备份或 dry-run。

## 日志字段标准

应用日志应尽量包含：

- `requestId`
- `userId` 或匿名标识 hash
- `role`
- `route`
- `statusCode`
- `latencyMs`
- `errorCode`
- `action`
- `targetType`
- `targetId`

不得包含：

- password、验证码、token、secret。
- 完整 session id。
- TOTP secret。
- 未脱敏邮箱批量列表。

## 审计不可抵赖

Admin 审计记录必须写在业务操作同一事务或可证明的同一操作链中。不能出现业务状态已变更但审计丢失。若审计写入失败，敏感操作应失败。

## Dashboard 建议

应建立最小运维看板：

- API health 与 5xx。
- DB pool。
- Redis availability。
- autosave rate/conflict。
- active attempts。
- prebuilt paper availability by exam_type/difficulty。
- import batch result。
- LLM cost/error。

看板应该同时显示最近一次成功事件和最近一次失败事件。例如 autosave 最近成功时间、auto-submit fallback 最近运行时间、import 最近成功批次、LLM 最近可用 provider。

## 事故等级

| 等级 | 示例 | 响应 |
| --- | --- | --- |
| SEV1 | 考试数据丢失、无法登录、权限越权 | 立即冻结发布、回滚/降级、复盘 |
| SEV2 | Admin 导入失败、部分考试类型无卷 | 当日修复或发布 workaround |
| SEV3 | 单页 UI 异常、非关键统计延迟 | 排入短期修复 |
| SEV4 | 文档漂移、低风险警告 | 常规维护 |

## 可观测性 PR 检查

- 新关键流程是否有日志。
- 新敏感操作是否有审计。
- 新后台任务是否有成功/失败计数。
- 新外部服务是否有 latency/error 记录。
- 新错误码是否能在日志中搜索。
- 是否有指标判断用户影响，而不只看进程存活。
- 是否明确哪些字段不能被记录。
- 是否有 requestId/runId/importBatchId/release 等关联字段。
- 是否为 Page 级风险提供 runbook 或排障入口。
