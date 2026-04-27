# 隐私、数据生命周期与日志脱敏规范

## 目标

Round1 面向青少年学习场景，必须默认采用最小化、可追溯、可删除、可解释的数据处理方式。本文件约束个人信息、认证数据、考试数据、日志、LLM 输入输出和运营导出。

## 数据分类

| 分类 | 示例 | 处理要求 |
| --- | --- | --- |
| 身份数据 | 用户 ID、邮箱、用户名、角色 | 最小展示，变更审计 |
| 认证敏感数据 | 密码 hash、session、TOTP secret、Passkey credential | 加密或 hash，严禁日志输出 |
| 安全审计数据 | 登录事件、设备 hash、IP 摘要、step-up 记录 | 可追溯，按保留期清理 |
| 学习数据 | attempt、答案、分数、用时、错题 | 仅本人、所属 coach、admin 按权限可见 |
| 内容资产 | 题目、解析、预制卷、导入批次 | 保留来源、checksum、版本 |
| 运维日志 | request id、latency、status、error code | 脱敏，避免原文 secret |
| LLM 数据 | prompt hash、provider、model、token、输出摘要 | 不含用户隐私，内容资产可追溯 |

## 最小化原则

- 前端配置端点只返回必要非敏感字段。
- 列表页只返回当前视图需要的摘要字段。
- 详情页按权限单独加载，不在列表中过量携带。
- 日志记录 ID、hash、摘要，不记录 secret、验证码、token、密码、完整 cookie。
- 导出文件只包含业务需要字段，默认不导出邮箱以外的敏感标识。

## 数据处理原则

- 先定义使用目的，再决定采集字段。
- 能用 ID/hash/摘要完成排障的，不保存原文。
- 能按权限现场查询的，不提前批量下发到前端。
- 能在离线内容环境完成的，不把生产用户数据发给 LLM 或外部工具。
- 新增数据字段必须说明展示范围、保留策略和删除/归档方式。

## 权限与可见性

| 数据 | student | coach | admin |
| --- | --- | --- | --- |
| 自己的考试记录 | 可以 | 不适用 | 可以审计/排障 |
| 班级 assignment 报表 | 仅自己 | 仅自己班级 | 可以 |
| 自练 attempt | 仅自己 | 不可见 | 可以审计/排障 |
| 用户邮箱 | 自己可见 | 默认不批量展示 | 可见但需审计操作 |
| 安全审计 | 自己的摘要 | 不可见 | 可见 |
| LLM/provider 日志 | 不可见 | 不可见 | 可见摘要 |

CoachReport 不得混入学生自练数据。Admin 全局能力必须通过 Admin UI 与审计体现，不得在 Coach UI 中隐式放大。

## 保留与清理

| 数据 | 默认策略 |
| --- | --- |
| 认证审计 | 保留，设备/IP hash 可按计划 180 天归档 |
| Admin 审计 | 长期保留 |
| 导入批次 | 长期保留 |
| 题库/预制卷版本 | 长期保留，archive 不硬删 |
| attempt/score | 长期保留，支持后续报表 |
| LLM provider logs | 保留可追溯字段，按成本与容量策略归档 |
| `artifacts/tmp/**` | 可清理 |
| `papers/**`、`artifacts/prebuilt-papers/**`、`artifacts/reports/**` | 审计输入，默认保留 |

清理脚本必须默认 dry-run，输出将删除的路径、数量、大小和保留原因。危险清理必须显式参数确认。

## 生命周期事件

| 事件 | 必须处理 |
| --- | --- |
| 用户注册 | 最小身份字段、邮箱 challenge 审计、频控记录 |
| 用户改密/重置 | session_version 失效、auth audit、旧 token 作废 |
| 用户禁用 | 阻止登录，保留学习和审计历史 |
| 用户软删除 | 隐藏个人展示信息，保留不可冒名约束 |
| 班级归档 | 停止新加入，保留历史 assignment 报表 |
| 题目/预制卷归档 | 不参与新选择，保留历史引用 |
| 导入批次清理 | 保留 checksum、summary、actor、时间 |
| 临时产物清理 | 默认 dry-run，不删除审计输入 |

## 用户删除与禁用

- 用户禁用不得删除考试历史、导入审计或 Admin 审计。
- 用户删除采用 `status='deleted'` 或等价软删除，邮箱/用户名唯一约束保持占用，避免冒名。
- 删除后的 UI 展示应使用“已删除用户”摘要，不泄露更多个人信息。
- 若未来提供数据导出/删除请求，必须先补计划，明确保留法律/审计例外。

## 日志脱敏

必须脱敏：

- `Authorization`、Cookie、CSRF token。
- 邮箱 challenge token、password reset token。
- OIDC code、id_token、access_token、refresh_token。
- TOTP secret、Passkey raw credential。
- Provider API key、SMTP password、DATABASE_URL。
- raw bundle 中可能包含的外部版权原文在普通运行日志中不输出。

日志字段推荐：

```text
requestId, actorId, role, action, targetType, targetId, statusCode,
errorCode, latencyMs, ipHash, userAgentHash
```

## LLM 与隐私

- 不向内容生产模型发送用户邮箱、session、IP、真实姓名或班级成员名单。
- 用户作答数据不得进入题目生成 prompt。
- LLM 日志默认记录 prompt hash、provider、model、token、latency、finish reason、错误摘要。
- 如必须保存 prompt/response 全文，只能用于离线内容资产审计，并标明来源和保留路径。
- 模型输出不得声称“官方解析”，除非确有官方来源记录。

## 导出与报表

- CSV/PDF 导出必须按权限过滤。
- Coach 导出仅限当前班级 assignment 数据。
- Admin 导出敏感报表应写 admin audit。
- 导出文件名不得包含邮箱、token、完整用户姓名等个人信息。
- 临时导出文件应有过期清理策略。

## 导出审批边界

- Student 只能导出自己的结果或打印当前试卷/结果。
- Coach 只能导出自己参与班级的 assignment 聚合和学生详情。
- Admin 导出跨用户数据必须写 admin audit。
- 导出前端按钮必须说明范围，例如“当前班级”“当前筛选结果”。
- 大批量导出应分页或异步生成，并设置过期清理。

导出字段新增必须经过隐私 review；不得因为调试方便临时加全量字段。

## 前端隐私体验

- 错误提示不暴露账号是否存在。
- 找回密码/注册 challenge 提交后使用中性文案。
- 会话管理显示设备摘要，不展示完整 IP。
- 安全页面展示“最近活动”时避免泄露其他地理细节。
- 复制邀请码、导出报表等操作成功后使用短 Toast，不在页面长时间暴露敏感内容。

## Incident 处理

发现可能泄露时：

1. 记录时间、影响范围、数据类型和入口。
2. 停止继续写入或展示敏感信息。
3. 轮换相关 secret/token。
4. 查询审计日志确认访问范围。
5. 修复后增加测试或 guard。
6. 更新相关 standard/plan，防止重复出现。

## 隐私 Review 检查清单

- 是否新增个人信息或学习行为字段。
- 是否有明确使用目的和展示范围。
- 是否能用摘要、hash 或 ID 替代原文。
- 是否进入日志、Sentry、LLM prompt、导出文件。
- 是否影响 Coach/Admin 权限边界。
- 是否有保留、归档、删除或脱敏策略。
- 是否补了权限过滤和脱敏测试。

## 禁止事项

- 禁止把 `.env`、secret、token、完整 cookie 放进 issue、PR、日志或 prompt。
- 禁止用前端隐藏替代后端权限过滤。
- 禁止 Coach 查看非本班级学生报表。
- 禁止导出全量用户数据作为调试捷径。
- 禁止在普通错误响应中返回 stack trace 或 SQL。
