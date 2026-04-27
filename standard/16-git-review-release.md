# Git、代码评审与发布规范

## 分支

- 默认分支名前缀使用 `codex/`，除非任务已有明确命名。
- 分支名使用小写 kebab-case：`codex/admin-import-retry-flow`。
- 不在主分支直接堆大改；高风险任务应分阶段。

## 提交

提交应保持单一主题。推荐格式：

```text
feat: add admin import retry flow
fix: prevent autosave overwrite on nonce conflict
docs: add offline artifact standard
test: cover prebuilt paper archive references
```

提交说明要让未来维护者看懂“为什么”，不仅是“改了什么”。

## PR 描述

必须包含：

- 背景/问题。
- 主要变更。
- 测试与验证命令。
- 风险与回滚。
- 文档同步情况。
- 截图或录屏（UI 变更）。

PR 应按 [22-standard-adoption-and-audit.md](22-standard-adoption-and-audit.md) 写明已检查的标准、验证结果和未覆盖风险。

## 代码评审

评审优先级：

1. 安全、隐私、权限。
2. 数据完整性、迁移、回滚。
3. 业务状态机和考试公平。
4. API 契约和兼容性。
5. UI/UX 定稿一致性。
6. 测试充分性。
7. 命名、复杂度、文档。

评论必须针对代码，不针对人。非阻塞建议标明 `Nit:` 或“建议”。

## Review 响应时限

参考 Google code review 对团队吞吐的取向，Round1 评审优化的是整体交付速度，不是单个开发者少被打断。

- 普通 PR 应在 1 个工作日内给出首次响应：批准、请求修改、提出阻塞问题或说明何时评审。
- 高风险 PR（安全、迁移、考试状态机、发布回滚）可以更慢，但必须先给出风险确认和预计评审窗口。
- 小 PR 不应因低优先级 polish 长时间卡住；可用 `LGTM with comments` 或后续 issue 收口。
- 如果 reviewer 需要更合适的人看安全、隐私、并发、可达性、DB 迁移，必须明确点名或标注需要的复核领域。
- 跨时区或异步协作时，至少留下下一步动作，避免 PR 长时间处于“无人知道卡在哪里”的状态。

## Review 结论语义

| 结论 | 含义 | 处理 |
| --- | --- | --- |
| Approve | 当前变更整体提升或保持代码健康，验证风险可接受 | 可合并 |
| Approve with comments | 剩余意见非阻塞，作者可本 PR 或后续处理 | 不阻塞 |
| Request changes | 存在必须先修的问题 | 修复后复审 |
| Comment | 信息、问题或范围说明 | 不代表批准 |

阻塞必须说明影响面和判断依据。不能用个人偏好阻塞合并；如果偏好确实应成为规则，应先更新 standard 或相关 plan。

## 合并门禁

禁止合并：

- 未解释的 failing test。
- 无测试的权限/状态机/迁移改动。
- 重新引入在线组卷/换题/运行时 LLM 生成。
- 改 UI 但未对照 UI/UX 规范。
- 新配置未更新 `.env.example` 和 reference。
- 新脚本无 README/帮助。

## 发布

发布前必须完成：

- 构建和测试。
- 数据库备份。
- 迁移兼容性确认。
- 健康检查。
- 关键路径 smoke。
- 监控观察窗口。

## 回归范围

每次发布至少 smoke：

- 注册/登录。
- Dashboard。
- 创建自练考试。
- 开始、autosave、提交、结果页。
- Admin imports。
- Admin settings step-up。
- 生产 health。

## 热修复

热修复可以缩短流程，但不能跳过：

- 问题定位。
- 最小修复。
- 针对性测试。
- 回滚方案。
- 事后补完整测试和复盘。

## PR 大小

推荐 PR 保持小而完整：

- 一个业务目标。
- 一组相关文件。
- 可独立验证。
- 文档同步在同一 PR。

避免把 UI 重设、DB 迁移、API 行为、测试重写混在同一个 PR。

必须拆分或先补计划的情况：

- 同时触碰 DB migration、权限模型、状态机和 UI。
- 单个 PR 难以在一次 review 中看完手写代码。
- 行为变更与纯格式化混在一起。
- 新能力还缺 reference/API/标准对齐，reviewer 无法判断目标态。

拆分时保持每个 PR 可独立验证；如必须串联，PR 描述写清依赖顺序和回滚点。

## Review 评论规范

参考 Google code review 的原则：

- 先看代码健康，再看个人偏好。
- 技术事实优先于意见。
- 说明原因，而不是只给命令。
- 可以指出问题并让作者选择方案。
- 非阻塞项标记 `Nit:`。

评论示例：

```text
[P1] 这里的 publish 没有检查 prebuilt_papers 是否已被 assignment 引用，
会允许覆盖历史任务引用。请在同一事务内查询 references，并对 published 版本
改为 copy-version 流程。
```

## Review 必看项

- 每一行手写代码。
- 新增依赖。
- 权限和认证路径。
- DB 迁移和数据回填。
- 并发/CAS。
- 错误码和前端文案。
- UI/UX token 和布局。
- 测试是否会在行为坏掉时失败。

## Review 严重级别

| 级别 | 含义 | 示例 |
| --- | --- | --- |
| P0 | 立即阻断，可能造成安全、数据或考试公平事故 | 越权、丢答案、不可逆迁移无备份 |
| P1 | 合并前必须修复 | 状态机非法迁移、缺少权限测试 |
| P2 | 应修复；如延期需记录原因 | 缺少边界测试、错误文案不清晰 |
| P3 | 非阻塞 polish | 命名可更清楚、局部排版细节 |

严重级别必须按用户影响和系统风险判断，不按评论者喜好判断。

## 发布标签

建议发布使用 tag：

```text
vYYYY.MM.DD.N
```

每个 tag 对应一份发布记录，包含迁移、配置、验证、回滚说明。

## 回滚 PR

回滚必须说明：

- 回滚哪个 commit/tag。
- 是否涉及 migration。
- 是否需要恢复配置。
- 用户数据是否受影响。
- 回滚后 smoke 结果。

## 热修复复盘

热修复完成后 2 个工作日内应补一份简短复盘，写入 PR、issue 或 `docs/plans/*-followup.md`：

- 触发条件和影响范围。
- 哪个测试、监控或标准未覆盖。
- 为什么热修复范围足够小。
- 是否需要补回归测试、监控、runbook 或 standard。

热修复不能成为长期绕过质量门禁的理由。
