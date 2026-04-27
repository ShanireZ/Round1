# 配置与环境变量规范

## 配置层级

配置优先级目标为：

```text
app_settings > .env > 代码默认值
```

`config/env.ts` 是环境变量代码真源。任何新增环境变量必须先进入 `config/env.ts`，再同步 `.env.example`、`plan/reference-config.md` 和必要部署文档。

## 命名

- 应用私有变量使用 `ROUND1_*`。
- 数据库：`DATABASE_*`。
- Redis：`REDIS_*`。
- Session：`SESSION_*`。
- Auth：`AUTH_*`。
- OIDC：`CPPLEARN_OIDC_*`。
- LLM：`LLM_*` + provider 专属前缀。
- Mail：`MAIL_*` + provider 专属前缀。

## Secret 管理

- `.env` 不得提交真实 secret。
- 生产 `.env` 权限必须 600，仅应用用户可读。
- secret 不得通过前端配置端点、日志、Sentry、错误响应暴露。
- 本地示例值必须使用明显占位符。

## 前端配置

前端只能通过 `/api/v1/config/client` 获取非敏感运行时配置。构建时变量不得包含 secret。

## LLM 配置

- 使用 provider-direct lane。
- `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` 必须解析到可用 provider。
- provider-specific `API_KEY/BASE_URL/MODEL` 缺失时应在启动或调用前给出明确错误。
- reasoning/thinking 控制需按 provider + model 能力发出。

## 邮件配置

- `MAIL_PROVIDER` 只能启用一个 provider。
- `MAIL_FROM` 必须与已验证域名一致。
- SPF/DKIM/DMARC 必须在上线前验证。
- 开发环境可以打印邮件内容；生产不得打印验证码或完整链接。

## 运行时配置热更新

- Admin settings 修改必须写 `app_settings`。
- 修改后发布 Redis `config:change`。
- API、runtime worker、content worker 必须刷新缓存。
- 如果 Redis 不可用，修改应有明确失败或降级提示，不能假装成功。

## 环境划分

| 环境 | 用途 | 规则 |
| --- | --- | --- |
| local | 开发 | 可使用本地 HTTPS、开发日志、mock/测试 provider |
| test | 自动化测试 | 不依赖真实外部服务 |
| offline-content | 内容生产 | 可运行 LLM/cpp-runner/content worker |
| production-runtime | 在线考试/API | 不部署 cpp-runner，不消费生成队列 |

## 配置变更验收

新增或修改配置必须验证：

- `config/env.ts` schema。
- `.env.example`。
- `plan/reference-config.md`。
- 启动失败信息清晰。
- 前端配置端点不泄密。
- 相关测试覆盖默认值与非法值。

## 配置分类

| 分类 | 示例 | 是否可运行时热更新 |
| --- | --- | --- |
| Secret | API key、SESSION_SECRET、KEK | 否 |
| Process | PORT、NODE_ENV、TRUST_PROXY_HOPS | 否 |
| Runtime setting | autosave、draft TTL、import size | 是 |
| Feature flag | QQ 登录开关 | 可按实现决定 |
| External endpoint | OIDC issuer、LLM base URL、R2 URL | 通常否 |

Secret 不进入 `app_settings`。

## Feature Flag

- flag 默认关闭。
- flag 名称表达 provider/功能和 enabled。
- 前端展示必须由 `/config/client` 或 providers API 决定。
- 后端必须在 flag 关闭时拒绝相关流程。
- flag 开启前必须有 smoke 和回滚方式。

## 启动校验

应用启动时应 fail fast：

- 必需 secret 缺失。
- URL 格式非法。
- 数字配置超范围。
- provider default 指向未配置 provider。
- 生产环境 cookie secure 未开启。
- trust proxy 配置与部署拓扑不符。

## 配置漂移控制

- `.env.example` 是示例，不是真源。
- `config/env.ts` 是解析真源。
- `plan/reference-config.md` 是人类参考。
- Admin settings 是运行时覆盖。

发现四者冲突时，先看代码真源，再更新文档和示例。

## Secret 轮换记录

每次轮换应记录：

- 轮换对象。
- 生效时间。
- 影响服务。
- 验证方式。
- 回滚方式。

不得在记录中写 secret 值。
