# 标准采纳、审计与持续改进规范

## 目标

让 `standard/` 不只是文档，而是每次需求、PR、发布和 agent 执行都能使用的执行系统。参考 Google 工程实践中的代码健康、Microsoft 文档风格中的清晰一致、Arco/Fluent 设计系统中的组件化治理，本文件规定标准如何进入日常流程。

## 触发时机

以下操作必须查阅并引用相关 standard：

- 新增或修改页面、组件、主题、交互。
- 新增或修改 API、状态机、数据库迁移。
- 新增认证、授权、Admin 敏感操作。
- 新增离线内容脚本、bundle、导入流程。
- 新增 LLM provider、prompt、agent 产线。
- 变更部署、配置、日志、Sentry、备份。
- 做大范围重构、删除 legacy、调整目录结构。

## PR 描述标准

PR 或任务收尾说明必须包含：

```markdown
## Change

## Standards Checked

## Verification

## Risk / Rollback

## Docs Updated
```

`Standards Checked` 至少列出被触碰的 standard 文件。若触碰 UI/UX，必须列出 [04-ui-ux.md](04-ui-ux.md) 的相关章节和 `plan/uiux_plan.md` 覆盖点。

## 影响面标签

每项变更至少标注一个影响面：

| 标签 | 触发标准 |
| --- | --- |
| `uiux` | 04、15 |
| `frontend` | 04、05、15、19 |
| `api` | 06、11、12 |
| `db` | 07、20 |
| `security` | 08、21 |
| `content` | 02、09、10 |
| `ops` | 13、14、12 |
| `agent` | 10、18、22 |
| `docs` | 17、22 |

影响面缺失视为评审风险。

## 标准漂移审计

每完成一个阶段或大型功能，应做一次标准漂移审计：

- `plan/`、`docs/plans/` 与 `standard/` 是否冲突。
- 代码实现是否已经超过或偏离 standard。
- UI 是否偏离 `plan/uiux_plan.md`。
- 新增脚本/API/配置是否没有对应规范。
- 禁止项是否被 legacy 重新引入。

审计结果可以写入 `docs/plans/YYYY-MM-DD-*-followup.md`，并在相关 standard 中补充硬约束。

## UI/UX 专项采纳

触碰前端视觉时必须完成：

- 对照 `plan/uiux_plan.md` 的 8 个环节。
- 检查 [04-ui-ux.md](04-ui-ux.md) 的 plan 覆盖矩阵。
- 更新 `/dev/ui-gallery`。
- 运行或说明未运行截图验收。
- 检查 Light/Dark、移动端、键盘、reduced motion、打印。

禁止以“只是小样式”绕过 UI/UX 定稿。

## Agent 执行标准

AI agent 执行任务时必须：

- 先读 relevant plan/standard，再修改。
- 不重设已定 UI/UX。
- 不恢复已收口的 no-runner、online generation、manual gen、inventory refill 旧语义。
- 对高风险变更写明验证和未覆盖风险。
- 对无法判断的标准冲突，先补调查记录，不扩大修改。

## 例外记录

标准例外必须写清：

- 违反的文件和章节。
- 当前为什么必须例外。
- 影响范围。
- 临时防护。
- 收口日期或触发条件。
- 负责人。

没有收口条件的例外不得合并。

## 标准版本化

- standard 文件按主题扩展，不在一个文件里堆所有内容。
- 新增主题需要更新 [00-index.md](00-index.md)。
- 标准只写当前目标状态；历史解释放 plan 或 followup。
- 与代码路径相关的条款必须使用当前仓库路径。
- 重命名文件必须保留索引更新，避免断链。

## 审查者职责

Reviewer 应优先检查：

- 是否破坏安全、数据完整性、考试公平。
- 是否偏离 UI/UX 定稿。
- 是否引入未登记状态或配置。
- 是否缺少测试、审计、回滚。
- 是否重复造 wheel 或分叉已有 workflow。
- 是否文档和实现同步。

风格偏好不得压过 standard。若 standard 本身不合理，应先提出 standard 修改。

## 自动化建议

应逐步增加 guard：

- 索引链接校验。
- standard 禁止词/legacy 词扫描。
- bundle 路径 runId 扫描。
- UI token magic color 扫描。
- OpenAPI 注册覆盖扫描。
- migration 序号唯一扫描。
- secret/log 脱敏扫描。

Guard 初期可为人工脚本，成熟后进入 CI。

## 禁止事项

- 禁止只更新代码不更新已受影响的 plan/reference/standard。
- 禁止让 standard 与 plan 长期保留互相矛盾描述。
- 禁止把外部公司规范原文照搬为 Round1 标准。
- 禁止用“Google/Microsoft/ByteDance 都这么做”替代本项目约束说明。
- 禁止让 agent 在未读相关 standard 的情况下批量重构。
