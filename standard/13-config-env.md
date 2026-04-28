# 配置与环境变量规范

## 配置层级

配置优先级目标为：

```text
app_settings > .env > 代码默认值
```

`config/env.ts` 是环境变量代码真源。任何新增环境变量必须先进入 `config/env.ts`，再同步 `.env.example`、`plan/reference-config.md` 和必要部署文档。

## 配置原则

- 配置用于表达环境差异和可运营参数，不用于隐藏未完成的业务逻辑。
- Secret、进程启动参数、运行时设置和 feature flag 必须分清，不能为了方便都塞进 `.env` 或 `app_settings`。
- 配置默认值必须安全、保守、可解释；生产缺失关键配置应 fail fast。
- 前端可见配置只返回结果，不暴露来源链、secret、内部 endpoint 或 provider 细节。
- 高风险配置变更应能回滚到旧值，并有 smoke 证明已生效。

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

Secret 使用应遵循最小范围：服务端读取后只传给需要的 provider/client，不在全局响应、Admin UI、导出、调试 summary 或错误 message 中展开。

## 前端配置

前端只能通过 `/api/v1/config/client` 获取非敏感运行时配置。构建时变量不得包含 secret。

前端配置字段必须遵守：

- 字段名包含单位，例如 `autosaveIntervalSeconds`。
- 只返回最终生效值，不返回 secret 来源、内部 base URL 或 provider key。
- feature flag 默认关闭；前端只按 enabled 字段展示可用入口。尚未实现的 provider 只能进入 placeholder 字段并渲染为禁用视觉占位，不得混入 enabled provider。
- 新增字段先让前端容错，再把它作为必需依赖。
- 可枚举配置（考试类型、难度、登录方式）由后端返回当前可用集合。

前端配置字段一旦发布即视为契约。字段重命名、单位变化、默认值语义变化必须按 API 兼容策略处理。

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

热更新只适用于已设计为动态读取的设置。进程级配置、secret、cookie、trust proxy、数据库连接和 provider base URL 通常需要重启或维护窗口，不得在 Admin UI 中伪装成即时生效。

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

配置验收还应覆盖“错误配置能否失败得足够清楚”。启动失败信息应指向变量名、期望格式和安全修复方式，但不输出 secret 值。

## 配置发布策略

配置变更按风险分级：

| 风险 | 示例 | 要求 |
| --- | --- | --- |
| low | UI 开关、非敏感阈值小幅调整 | Admin audit + smoke |
| medium | autosave、draft TTL、rate limit | 观察指标 + 回滚值 |
| high | cookie、OIDC、邮件域名、secret 轮换 | 计划、维护窗口、回滚/失效策略 |

运行时配置必须保留旧值或回滚方式。高风险配置不得和大版本发布混在一起，除非同一计划明确验证顺序。

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

Feature flag 不是权限系统。flag 开启后仍必须经过角色校验、输入校验、审计和 rate limit。长期 flag 应在功能稳定后删除或转为正式配置，避免代码路径无限分叉。

## 启动校验

应用启动时应 fail fast：

- 必需 secret 缺失。
- URL 格式非法。
- 数字配置超范围。
- provider default 指向未配置 provider。
- 生产环境 cookie secure 未开启。
- trust proxy 配置与部署拓扑不符。

测试环境可以使用专用默认值，但测试默认值不得被生产环境继承。`NODE_ENV=production` 下任何 mock provider、宽松安全默认值或占位 secret 都应阻断启动。

## 配置漂移控制

- `.env.example` 是示例，不是真源。
- `config/env.ts` 是解析真源。
- `plan/reference-config.md` 是人类参考。
- Admin settings 是运行时覆盖。

发现四者冲突时，先看代码真源，再更新文档和示例。

漂移审计应检查：

- `config/env.ts` 是否有 `.env.example` 对应项。
- runtime setting definitions 是否有 Admin UI 展示与权限控制。
- `plan/reference-config.md` 是否仍描述当前优先级和默认值。
- 部署文档是否写清生产必须外置的 secret。
- 前端是否仍硬编码已改为后端配置的枚举。

## Secret 轮换记录

每次轮换应记录：

- 轮换对象。
- 生效时间。
- 影响服务。
- 验证方式。
- 回滚方式。

不得在记录中写 secret 值。

轮换记录应说明是否会导致 session 失效、TOTP 重新加密、邮件/OIDC/LLM smoke、缓存刷新或 worker 重启。只替换值不验证调用链，视为未完成。

## 配置失败处理

- 启动必需配置缺失时 fail fast，不进入半可用状态。
- 运行时配置保存失败必须让 Admin 明确看到失败，不显示“已生效”。
- Redis `config:change` 失败时，要么回滚写入，要么提示需重启/刷新缓存。
- provider 配置缺失导致调用失败时，错误码应表达 provider unavailable，不暴露 key 名和值。
- 配置回滚后必须做对应 smoke，例如登录、邮件、autosave 或导入。

## 配置 Review 检查清单

- 是否属于 env、runtime setting、feature flag 或 secret，分类是否正确。
- 是否更新 `config/env.ts`、`.env.example`、runtime definitions、reference 和部署文档。
- 是否有安全默认值和非法值测试。
- 是否影响前端 `/config/client` 契约。
- 是否需要 Admin audit、Redis `config:change`、worker 刷新或重启。
- 是否写清回滚值、观察指标和 smoke。
