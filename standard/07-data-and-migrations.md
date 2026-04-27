# 数据模型与迁移规范

## 数据库边界

Round1 使用 PostgreSQL + Drizzle ORM。数据库保存用户、认证、题库、预制卷、个人试卷、attempt、班级任务、审计、运行时配置与 LLM provider 日志。

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

## 查询规范

- 默认使用 Drizzle 类型安全查询。
- 复杂 SQL 可以使用 raw SQL，但必须说明原因并测试。
- 列表查询必须分页，默认限制上限。
- 热路径需要索引，尤其是 exam selection、attempt active、import batch、admin list。
- 事务内读取和写入必须使用同一个 `tx` 对象。

## JSON 字段

- `content_json`、`answer_json`、`explanation_json`、`answers_json`、`ai_report_json` 必须保持向后兼容。
- 变更 JSON schema 时必须提供迁移或读取兼容层。
- 用于审计的 raw bundle / checksum / summary 不得被后续 apply 覆盖。

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

