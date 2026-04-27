# 产品域与内容规范

## 产品边界

Round1 是面向青少年学生、教练、管理员的信息学竞赛模拟测试平台，覆盖 CSP-J/S 与 GESP 1-8 级。核心路径是：

```text
离线内容生产 -> bundle 校验 -> 管理员导入/发布 -> 学生选择已发布预制卷 -> 克隆个人试卷 -> 作答 -> 批改 -> 报告/教练统计
```

生产运行时只承担登录、题库/预制卷管理、考试实例创建、作答保存、提交批改、报告查询和教练报表。禁止恢复线上 AI 生成题目、在线组卷、在线换题、自动库存补货。

## 用户角色

| 角色 | 权限边界 |
| --- | --- |
| student | 自助考试、查看自己的成绩和班级任务 |
| coach | 管理自己参与的班级、任务、报表；不能访问 Admin 内容库和系统设置 |
| admin | 管理题库、预制卷库、导入中心、用户角色、系统设置；敏感操作需要 step-up |

V1 单账号单角色。coach/admin 以学生身份体验答题时，其 attempt 数据不得进入班级统计。

## 术语统一

必须使用 `plan/glossary.md` 的中英文术语。重点如下：

- 题库：已导入问题集合，支持 `draft / reviewed / published / archived` 生命周期。
- 预制卷：离线生成并发布到预制卷库的标准卷。
- 个人试卷实例：从预制卷复制出的用户私有 `paper instance`。
- 导入批次：一次 bundle dry-run 或 apply 的审计记录。
- 判官：LLM 二次校验角色，只在离线内容生产/审核链路使用。
- `tab_nonce`：答题会话浏览器标签唯一标识，防多标签冲突。

禁止在新文档或 UI 中混用“卷包”“paper-packs”“在线生成”“库存补货”等旧语义。历史路径可作为 legacy 描述，但必须标明已弃用。

## 内容质量

- 真题与模拟题必须区分来源；真题导入需保留来源、年份、考试类型、题型、知识点、答案和解析。
- CSP-J/S、GESP 内容范围必须对齐 `plan/reference-exam-knowledge.md` 与 `plan/noi-syllabus-2025.md`。
- 程序阅读/完善程序题必须经过离线 sandbox 或等价校验后，才能进入可发布资产。
- LLM 生成题必须经过结构校验、去重、答案一致性检查和判官/人工复核。
- 解析必须面向学生，不得只写“显然”“略”。错误解释不得责备用户。

## 状态生命周期

- 题目：`draft -> reviewed -> published -> archived`。已发布题目如需大改，应复制或生成新版本，保留历史引用。
- 预制卷：`draft -> published -> archived`。已发布预制卷视为不可变资产，禁止原地覆盖。
- 个人试卷：`draft -> started -> completed/abandoned`。
- attempt：`started -> submitted/auto_submitted`，finalizer 必须幂等。
- assignment progress：`pending -> in_progress -> completed/missed`。

## 内容删除原则

- 已被引用的题目、预制卷、试卷实例、导入批次不得硬删。
- 未引用 draft 可以删除，但删除动作必须记录审计。
- 默认优先 archive，不用 delete。

## 文案语气

采用中文单语 MVP。文案使用“你”，避免“您”；面向青少年清晰直接。错误提示必须说明下一步，如“请重新登录后继续作答”，而不是只给错误码。

## 核心流程

### 学生自练

```text
选择 exam_type + difficulty
-> 服务端从 published prebuilt_papers 选模板
-> 克隆为个人 paper draft
-> startAttempt 写 tab_nonce 并调度 auto-submit
-> autosave patches
-> submit/finalizer
-> result payload
```

硬约束：

- 只能从已发布预制卷克隆。
- 最近作答软排除只作用于预制卷模板层，不作用于题目替换。
- 无可用模板返回 `ROUND1_PREBUILT_PAPER_UNAVAILABLE`。

### 教练任务

```text
coach 创建班级
-> 邀请学生入班
-> 绑定固定 prebuilt paper 创建 assignment
-> 学生一次作答
-> assignment_progress 更新
-> CoachReport 统计班级 attempts
```

硬约束：

- 同一 assignment 同一学生只能有一次作答。
- 报表只统计 student 角色。
- coach 只能访问自己参与的班级，admin 可管理全部。

### Admin 内容库

```text
导入 bundle dry-run
-> 查看 summary / errors
-> apply
-> publish/archive/copy-version
-> 引用摘要辅助决策
```

硬约束：

- dry-run/apply 复用 scripts workflow。
- 已引用资产不能硬删。
- 已发布预制卷只能 copy-version 后修改。

## 题型与计分

| 题型 | 结构 | 计分 |
| --- | --- | --- |
| 单选 | 15 题 | 每题独立计分 |
| 阅读程序 | 3 组 x 5 子题 | 子题级聚合 |
| 完善程序 | 2 组 x 5 子题 | 子题级聚合 |

总分固定 100。阅读/完善程序在缺少显式子题分值时，按 slot points 均分并将余数前置。

## 内容准入标准

一批题目进入 `published` 前必须满足：

- 题面、选项、答案、解析结构完整。
- 题型和知识点匹配目标 exam_type。
- content hash 和 Jaccard 去重通过。
- 程序题 sandbox verified。
- 真题官方答案比对通过，或有人工备注解释差异。
- LLM 判官拒收/警告项已处理。

## 内容质量红线

禁止发布：

- 答案与解析自相矛盾的题。
- 题面依赖外部图片/链接才能作答的题。
- 代码题无法确定 C++ 标准或输入输出行为的题。
- 超出 CSP-J/S、GESP 当前级别范围且未标注为提高内容的题。
- 含版权不明大段复制内容且无来源记录的题。

## 后续扩展边界

- AI 智能建议属于 v2，可保留 Dashboard 占位或静态规则。
- QQ 登录属于 feature flag，未启用前不得在 UI 主路径强展示。
- i18n 为未来扩展，当前不要为多语言牺牲中文体验质量。
