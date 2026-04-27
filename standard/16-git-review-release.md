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
