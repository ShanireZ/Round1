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

## 采纳等级

标准落地按四级推进，避免一开始就要求所有规则自动化，也避免长期停在口头约束。

| 等级 | 状态 | 要求 |
| --- | --- | --- |
| L0 documented | 已写入 standard | 可人工 review |
| L1 referenced | PR/计划引用 | 说明检查了哪些条款 |
| L2 verified | 有测试、脚本、截图或演练证明 | 验证结果可追溯 |
| L3 automated | CI/脚本自动检查 | 失败会阻塞或明确提示 |

安全、权限、迁移、考试状态机、内容导入至少应达到 L2。格式、链接、命名等低风险规则可逐步从 L1 进入 L3。

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

## 标准选择方法

执行任务前按问题域选择标准：

1. 先看是否触碰 S0/S1：安全、隐私、数据、考试公平、部署。
2. 再看用户表面：UI/UX、API、文案、报表、导出。
3. 再看实现面：前端、后端、DB、脚本、配置、agent。
4. 最后看交付面：测试、文档、发布、回滚。

不要机械列出所有 standard；列出真正影响本次变更的文件，并写清“不适用”的高风险项。

## 标准漂移审计

每完成一个阶段或大型功能，应做一次标准漂移审计：

- `plan/`、`docs/plans/` 与 `standard/` 是否冲突。
- 代码实现是否已经超过或偏离 standard。
- UI 是否偏离 `plan/uiux_plan.md`。
- 新增脚本/API/配置是否没有对应规范。
- 禁止项是否被 legacy 重新引入。

审计结果可以写入 `docs/plans/YYYY-MM-DD-*-followup.md`，并在相关 standard 中补充硬约束。

审计输出至少写清：

- 本次检查范围。
- 发现的冲突或未发现阻塞项。
- 哪些规则已经有自动化验证。
- 哪些规则仍依赖人工 review。
- 新增、放宽或延期的标准项。
- 后续 owner 或触发条件。

## 审计节奏

- 每个大型功能收口后做一次局部审计。
- 每次生产发布前做一次 release 相关审计。
- 每月或每个里程碑做一次轻量全局审计。
- 出现事故、热修复或大范围返工后，必须复核相关 standard 是否缺规则或过严。

审计目标是减少漂移，不是制造文档工作量；没有发现问题也应记录“未发现阻塞项”和剩余风险。

## 标准债务

当某条标准合理但暂时无法完全执行时，记录为标准债务，而不是删除规则或假装已满足：

| 字段 | 说明 |
| --- | --- |
| standard | 文件和章节 |
| gap | 当前缺口 |
| risk | 用户、数据、运维或协作影响 |
| mitigation | 临时防护 |
| trigger | 何时必须收口 |
| owner | 负责跟进的人或角色 |

标准债务不得用于绕过 S0/S1 红线。安全、隐私、考试数据、不可逆迁移和已发布内容资产不能长期债务化。

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

Agent 收尾说明应简洁列出：

- 修改了哪些文件。
- 对照了哪些 standard/plan。
- 跑了哪些验证，哪些没跑。
- 剩余风险和下一步最小动作。

不得用冗长过程叙述替代验证结果。

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

## 标准变更原则

新增或收紧标准必须满足：

- 解决真实风险、重复问题或已确认的实施缺口。
- 有可执行验收方式。
- 不与 `plan/uiux_plan.md`、最新 `plan/step-*`、`docs/plans/*` 冲突。
- 对现有遗留实现给出过渡或豁免策略。
- 不要求当前团队无法稳定执行的重流程。

删除或放宽标准必须说明不会降低安全、数据完整性、考试公平和可追溯性。

新增标准前先问三个问题：

1. 它能否被 review、测试、脚本、截图或 runbook 验收。
2. 它是否和 Round1 当前规模匹配。
3. 它是否降低实际风险，而不是增加文档仪式感。

答案不清楚时，先写为建议或 checklist，不直接写成必须。

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

自动化 guard 的引入顺序：

1. 低误报、低维护成本：链接、migration 序号、格式化。
2. 高价值、可解释：OpenAPI 注册、错误码、env/reference 同步。
3. 需要人工兜底：UI token magic color、legacy 语义、隐私日志字段。
4. 高误报规则先 warning，再按实际噪声决定是否阻塞。

Guard 失败信息必须告诉执行者如何修复，不只给红灯。

Guard 初期可为人工脚本，成熟后进入 CI。

## 采纳成熟度目标

| 领域 | 近期最低目标 | 说明 |
| --- | --- | --- |
| security/privacy | L2 | 权限、脱敏、step-up、secret 不靠口头约束 |
| exam state | L2 | autosave、submit、恢复、finalizer 必须有测试 |
| content import | L2 | bundle schema、checksum、dry-run/apply 有脚本和记录 |
| UI/UX | L1-L2 | token/截图/人工验收结合，逐步补自动截图 |
| docs/plan | L1 | PR/任务明确引用并检查路径、状态口径 |
| naming/style | L1-L3 | 格式化自动化，领域命名先人工 review |
| ops/release | L1-L2 | 发布记录、备份恢复、smoke 逐步模板化 |

成熟度目标不是一次性门槛。每次事故、返工或重复 review 评论，都应把相关规则向更高等级推进。

## 禁止事项

- 禁止只更新代码不更新已受影响的 plan/reference/standard。
- 禁止让 standard 与 plan 长期保留互相矛盾描述。
- 禁止把外部公司规范原文照搬为 Round1 标准。
- 禁止用“Google/Microsoft/ByteDance 都这么做”替代本项目约束说明。
- 禁止让 agent 在未读相关 standard 的情况下批量重构。
