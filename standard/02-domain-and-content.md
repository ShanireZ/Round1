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

