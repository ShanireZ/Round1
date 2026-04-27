# 产品流程与状态机规范

## 目标

把 `plan/step-*`、`plan/reference-schema.md`、`docs/plans/*` 中已经确定的业务生命周期固化为统一标准，避免前端、后端、数据库、脚本和 agent 各自理解状态。

本文件优先约束业务状态、允许迁移、幂等、审计和 UI 展示。字段名、表结构细节以 `plan/reference-schema.md` 与 Drizzle schema 为准。

## 通用原则

- 状态必须可枚举、可审计、可测试。
- 状态迁移只能由服务端完成，前端不得直接提交目标状态绕过业务规则。
- 状态迁移 API 必须返回迁移后的最新资源摘要。
- 高风险迁移必须写审计日志或业务事件。
- 已发布、已提交、已导入、已审计的数据默认不可原地覆盖。

状态机设计应优先让失败可恢复：重复请求不产生重复副作用，并发请求只有一个成功，非法迁移返回稳定错误码，UI 能解释为什么不能操作。

## 状态机设计规则

- 每个状态值必须有业务含义、进入条件、允许操作和终止条件。
- 状态字段不得复用为多个含义，例如既表示审核状态又表示发布状态。
- 临时状态必须有超时、清理或恢复策略。
- 状态迁移必须由服务端读取当前状态后判断，不接受前端直接覆盖目标状态。
- 新增状态值必须同步 DB enum/check、API schema、前端文案、测试和 reference。
- 终态数据默认只读；确需修正时走 copy-version、amendment、archive 或管理员审计流程。

## 学生自练考试流程

```text
选择 exam_type/difficulty
-> 服务端选择 published prebuilt_paper
-> 克隆 paper instance
-> startAttempt
-> autosave
-> submit/finalizer
-> result
```

硬约束：

- 生产运行时只从已发布预制卷创建个人试卷实例。
- 无可用预制卷返回稳定错误码，不触发在线生成或换题。
- 克隆个人试卷必须保留 slot snapshot、题目快照和分值。
- `startAttempt` 必须写入 `tab_nonce`，用于多标签冲突保护。
- `autosave` 只保存 patch，不允许重写整份答卷。
- `submit` 与 finalizer 必须幂等；重复提交返回已有结果。
- App 启动必须能通过 active attempt 恢复未完成考试。

考试流程中，保存与提交的可信来源始终是服务端。前端可以缓存未发送 patch，但不能在服务端未确认时宣称最终保存或提交成功。

## Paper / Attempt 状态

| 对象 | 状态 | 允许迁移 | 禁止 |
| --- | --- | --- | --- |
| paper instance | `draft` | `started`、`abandoned` | draft 之外再换题 |
| paper instance | `started` | `completed`、`abandoned` | 被其他 attempt 覆盖 |
| paper instance | `completed` | 无 | 修改题目快照 |
| attempt | `started` | `submitted`、`auto_submitted` | 重开新 attempt 覆盖旧 attempt |
| attempt | `submitted/auto_submitted` | 无 | 再次评分产生不同结果 |

不变量：

- finalized attempt 必须对应 completed paper。
- completed paper 必须有稳定 score summary。
- auto-submit 与人工 submit 竞争时只允许一个 finalizer 成功。
- `tab_nonce` 不匹配必须 409，不得静默覆盖。

finalizer 必须记录最终采用的触发来源：manual submit、auto-submit delayed job、cron fallback 或管理员修复。重复 finalizer 应返回同一结果摘要，不重新评分产生漂移。

## 教练班级流程

```text
coach 创建班级
-> 生成/管理邀请码
-> student 加入班级
-> coach 创建 assignment
-> student 作答
-> report 聚合
```

硬约束：

- 班级至少有一名 owner coach。
- coach 只能操作自己参与的班级。
- 邀请码使用原子扣减，过期、撤销、超过次数均不可加入。
- admin 可以管理全局，但 Admin 操作必须有独立入口和审计。

班级和邀请流程必须避免越权扩散：coach 只能看到自己参与的班级，邀请链接只能授予入班资格，不能授予 coach/admin 权限。

## Assignment 状态

| 对象 | 状态 | 说明 |
| --- | --- | --- |
| assignment | `draft` | 未发布，可编辑 |
| assignment | `published` | 学生可作答 |
| assignment | `closed` | 截止或手动关闭 |
| assignment progress | `pending` | 未开始 |
| assignment progress | `in_progress` | 已开始但未提交 |
| assignment progress | `completed` | 已提交或自动提交 |
| assignment progress | `missed` | 截止未开始 |

规则：

- 同一 assignment 同一学生只能有一次 attempt。
- assignment 绑定一张明确的已发布预制卷。
- 自动提交时间为 `min(started_at + duration, assignment.due_at)`。
- CoachReport 只统计班级 assignment attempts，不统计学生自练。
- coach/admin 以学生身份体验答题的数据不进入班级报表。

assignment 关闭后不得创建新的 student attempt。已经开始的 attempt 按业务规则自动提交或标记 missed，不能让同一学生出现多个互相竞争的 progress。

## 内容资产生命周期

### 题目

```text
draft -> reviewed -> published -> archived
```

- `draft` 可编辑，可在未引用时硬删。
- `reviewed` 表示结构、答案、解析、知识点已过审。
- `published` 可进入预制卷，不可被破坏性修改。
- `archived` 保留历史引用，不参与新卷选择。

### 预制卷

```text
draft -> published -> archived
```

- 已发布预制卷不可原地覆盖。
- 修改已发布版本必须 `copy-version` 生成新 draft。
- 已被 assignment 或 paper instance 引用的预制卷不能硬删。
- lineage 必须保留 root、parent、versionNo。

## 导入批次流程

```text
validate
-> dry-run import batch
-> apply import batch
-> publish/archive/copy-version
```

硬约束：

- dry-run 不写业务表，但必须返回与 apply 一致的 summary 语义。
- apply 必须写 `import_batches`，记录 raw checksum、summary、sourceFilename 和 actor。
- question bundle 与 prebuilt paper bundle 复用 scripts/lib workflow。
- 失败批次必须能定位 item、字段路径、错误码和是否可重试。
- 任何导入都不得绕过 checksum manifest 和 schema 校验。

导入批次状态必须让操作者知道下一步：可修复重试、不可重试需新 bundle、已 apply 可发布、已发布需 archive/copy-version。不得只显示通用 failed。

## Admin 设置流程

```text
读取 app_settings + env defaults
-> admin step-up
-> 写 app_settings
-> admin audit
-> Redis PUBLISH config:change
-> API/runtime worker/content worker 刷新配置
```

规则：

- 配置真源优先级：`app_settings > .env > 代码默认值`。
- 前端只展示可调配置，不展示 secret。
- 配置保存成功后必须给出热更新反馈。
- 失败时不得让前端误以为配置已生效。

配置状态和生效状态必须区分。写入 `app_settings` 成功但 Redis 通知失败时，应提示缓存刷新风险或要求重启/重试，不显示完全成功。

## 状态机 API 标准

状态转换端点必须满足：

- 使用动作端点，例如 `/publish`、`/archive`、`/copy-version`、`/submit`。
- 请求体只包含必要输入。
- 服务端读取当前状态并校验允许迁移。
- 使用事务或 CAS。
- 写审计或业务事件。
- 返回最新状态和用户可理解的摘要。

非法迁移应返回稳定业务错误，包含当前状态、目标动作和可理解原因。不要让前端通过解析英文 message 判断下一步。

## UI 展示标准

- 状态文案必须与本文件一致。
- 状态颜色必须使用 [04-ui-ux.md](04-ui-ux.md) 中语义色。
- 不可操作状态要展示原因，例如“已被任务引用，只能归档”。
- 长流程使用步骤式进度，不用单个 spinner。
- Admin 危险状态迁移必须有二次确认和 step-up。

UI 应避免展示“看似可点但必然失败”的操作。若按钮禁用，必须能通过 tooltip、文案或状态说明知道原因；若允许点击后失败，错误必须来自后端真实状态。

## 测试要求

每条状态机至少覆盖：

- 合法迁移成功。
- 非法迁移失败。
- 权限不足失败。
- 并发重复请求幂等或冲突。
- 审计记录写入。
- 前端禁用/错误文案展示。

还应覆盖恢复路径：刷新页面、重复提交、worker 重试、Redis 短暂失败、过期/关闭边界、角色切换或权限不足。无法自动化的恢复路径必须写手工验收记录。

## 禁止事项

- 禁止前端自己推断并提交最终状态。
- 禁止已发布预制卷原地编辑。
- 禁止用软删除代替明确 archive 状态而不更新 UI。
- 禁止在 finalizer 中调用外部网络、LLM 或长耗时任务。
- 禁止因为缺卷而恢复在线组卷。
- 禁止用布尔字段堆叠出隐式状态机而不定义允许组合。
- 禁止把状态迁移失败吞掉后让 UI 继续显示旧成功态。
