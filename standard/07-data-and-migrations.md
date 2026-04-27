# 数据模型与迁移规范

## 数据库边界

Round1 使用 PostgreSQL + Drizzle ORM。数据库保存用户、认证、题库、预制卷、个人试卷、attempt、班级任务、审计、运行时配置与 LLM provider 日志。

## 数据设计原则

- 数据库约束保护长期不变量，应用层校验保护用户体验；两者不能互相替代。
- 表结构优先表达业务事实和生命周期，不把临时 UI 状态或脚本中间态持久化为核心模型。
- 已发布、已提交、已导入、已审计的数据默认追加新版本或 archive，不原地破坏历史含义。
- 新字段必须明确可空性、默认值、写入方、读取方、保留策略和迁移路径。
- 设计要考虑最坏情况：重复请求、并发提交、worker 重试、Redis 短暂不可用、脚本中断后重跑。

## Schema 规范

- 表名与列名使用 snake_case。
- Drizzle schema 文件按领域拆分，统一从 `server/db/schema/index.ts` 导出。
- JSON 字段必须在 `plan/reference-schema.md` 定义结构、用途和兼容策略。
- 枚举值必须集中定义；应用层不得散落硬编码状态字符串。
- 外键、唯一约束、CHECK、关键索引必须进入迁移，不只存在应用代码校验。

## 状态机

- 状态变更必须单向、可审计、可恢复。
- 已发布预制卷不可原地覆盖，修改必须 copy-version 生成新的 draft。
- 已引用资产优先 archive，不硬删。
- attempt finalization 必须幂等。

## 迁移文件

- 迁移文件命名：`NNN_<action>.ts`，序号严格递增。
- 禁止同一序号多个迁移长期共存；发现后必须用新迁移或重排计划收口。
- 线上迁移默认只做兼容新增：加表、加列、加索引、加 nullable 字段、回填。
- 禁止在同一次部署中做不兼容删列、改列语义、重命名列。
- 不可逆迁移必须先有备份和恢复演练。

## 迁移风险矩阵

| 类型 | 示例 | 要求 |
| --- | --- | --- |
| 低风险 expand | nullable 列、新表、新索引、兼容枚举值 | 普通测试 + reference 更新 |
| 中风险 backfill | 批量填充、生成 checksum、修复历史状态 | rehearsal、批次记录、可重复运行 |
| 高风险 switch | 读写切到新结构、状态机语义变化 | 分阶段发布、双读/兼容或回滚说明 |
| 禁止直接做 | 删列、改字段含义、重命名契约字段、硬删历史 | 先 contract 计划和备份恢复 |

迁移风险按用户影响判断，不按代码行数判断。小改动如果会影响 attempt、权限、已发布预制卷或导入批次，也按高风险处理。

## 查询规范

- 默认使用 Drizzle 类型安全查询。
- 复杂 SQL 可以使用 raw SQL，但必须说明原因并测试。
- 列表查询必须分页，默认限制上限。
- 热路径需要索引，尤其是 exam selection、attempt active、import batch、admin list。
- 事务内读取和写入必须使用同一个 `tx` 对象。

列表接口应避免 N+1 查询。需要聚合摘要时优先在查询层一次性取齐，或明确分页后再补充，不在前端触发每行一个请求。

## JSON 字段

- `content_json`、`answer_json`、`explanation_json`、`answers_json`、`ai_report_json` 必须保持向后兼容。
- 变更 JSON schema 时必须提供迁移或读取兼容层。
- 用于审计的 raw bundle / checksum / summary 不得被后续 apply 覆盖。

JSON 字段必须有版本或可推断 schema。读取代码应容忍旧字段缺失，写入代码应只写当前版本。不得把经常筛选、排序、权限判断或 join 的字段藏进 JSON。

## 运行时配置

- `app_settings` 是运行时配置表。
- 配置读取目标优先级：`app_settings > .env > 代码默认值`。
- Admin 设置更新必须发布 Redis `config:change`，API/runtime worker/content worker 收到后刷新缓存。

## 数据保留

- 认证审计、Admin 审计、导入批次、LLM provider 日志必须保留足够追溯信息。
- `auth_audit_logs.device_id_hash` 按计划保留 180 天后归档清理。
- 备份文件权限必须为 600，且恢复流程要定期演练。

## 迁移验证

每个 DB 变更至少验证：

```bash
npm run migrate:status
npm run test
```

涉及线上兼容性的迁移必须补 rehearsal 或临时库恢复验证。

## 迁移分阶段策略

高风险 DB 变更采用 expand -> migrate -> contract：

1. Expand：新增表/列/索引，保持旧代码可运行。
2. Backfill：用脚本或迁移填充数据，记录批次和校验。
3. Switch：应用代码读取新结构，保留旧结构兼容。
4. Contract：确认无旧读取后，另一次部署删除旧结构。

禁止在同一部署中同时“新增新结构、切流量、删除旧结构”。

Backfill 脚本必须可重入：重复运行不会重复写入、覆盖人工修正或破坏已审计数据。长耗时 backfill 应分批、记录进度，并能在失败后从上次安全点继续。

## 索引规范

新增查询必须说明是否需要索引。以下场景必须评估索引：

- `WHERE status + exam_type + difficulty`。
- `WHERE user_id + status`。
- `WHERE assignment_id + user_id`。
- import batch 按时间倒序。
- audit/log 按 actor/action/time 查询。
- `content_hash` 去重。

索引命名应包含表和列含义，避免数据库自动名难以维护。

新增索引前应确认查询形态稳定。大表索引需要评估创建时间和锁影响；如果生产数据量已不可忽略，应安排低峰窗口或使用数据库支持的低锁方式。

## 事务规范

必须用事务：

- startAttempt 创建 attempt、激活 paper、推进 assignment progress。
- submit/finalizer 写 attempt、paper、assignment progress。
- publish/archive 检查引用并写状态。
- import apply 写 batch 与业务表。
- owner 转让或多教练关系变更。

事务中不得执行外部网络调用或 LLM 调用。

并发写入必须依赖数据库能力而不是前端禁用按钮。可选手段包括唯一约束、行锁、条件 update、版本号、幂等键和状态条件。选择哪种手段应能从代码和测试看出来。

## 数据一致性红线

禁止出现：

- `attempts.status` finalized 但 `papers.status` 仍 active。
- `assignment_progress.completed` 但没有 finalized attempt。
- published prebuilt paper 指向未 published/reviewed 可用题目。
- paper instance 缺少 slot snapshot。
- import apply 无 import batch。

这些不变量应有测试或巡检脚本覆盖。

## 删除与归档

- draft 且未引用才允许硬删。
- 已引用数据只能 archive 或软删除。
- 用户删除使用 `status='deleted'`，邮箱/用户名唯一约束保持占用。
- 内容资产删除前必须展示引用摘要。

硬删前必须能证明对象未被引用。引用检查不能只查当前 UI 可见关系，还要覆盖 assignment、paper instance、attempt、import batch、audit、report 等历史链路。

## 数据审计与隐私

- 审计日志保存摘要，不保存 secret。
- IP、设备指纹等敏感标识应 hash 或按隐私策略保留。
- LLM prompt/response 如包含题库资产，可保存 hash/摘要，谨慎保存全文。

## DB Review 检查清单

- migration 是否序号唯一。
- 是否线上兼容。
- 是否有回滚或恢复策略。
- 是否有索引。
- 是否更新 Drizzle schema 和 reference。
- 是否有测试覆盖新状态/约束。
- 是否考虑数据量和锁表风险。
- 是否说明 backfill 可重入和失败恢复。
- 是否更新 JSON schema、OpenAPI 或前端读模型。
