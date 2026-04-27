# 可观测性与审计规范

## 目标

任何线上问题、内容质量问题、权限变更、导入结果、LLM 成本异常，都必须能通过日志、审计记录和数据库状态追溯到原因。

## 日志

- 后端使用 pino/pino-http。
- 每个请求应有 method、path、status、latency、request id 或可关联字段。
- 5xx 必须记录 error stack；生产响应不得暴露 stack。
- 4xx 只记录必要上下文，不记录敏感输入。
- 日志中禁止出现密码、验证码、session id、CSRF token、API key、TOTP secret。

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

## 告警

应该告警：

- 连续 5xx 或 p95 latency 异常。
- DB/Redis 连接失败。
- prebuilt paper pool 某考试类型/难度为空。
- import apply 失败率异常。
- Admin role/settings 高频变化。
- LLM 成本突增或 provider 全部失败。

## 数据保留

- 审计日志保留周期按安全与隐私策略设定。
- LLM 原始 prompt/response 如包含敏感或版权风险内容，默认不长期保存全文；保存 hash、摘要和必要诊断字段。
- import batch raw checksum 必须保留，raw bundle 可按存储策略归档。

## 排障要求

每个生产事故复盘必须包含：

- 时间线。
- 用户影响范围。
- 根因。
- 哪条监控/日志发现或未发现。
- 修复与回归测试。
- 规范或计划是否需要更新。

