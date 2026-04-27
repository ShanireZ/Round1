# 文档与计划维护规范

## 文档分层

| 层级 | 目录 | 用途 |
| --- | --- | --- |
| 标准 | `standard/` | 长期规范、评审准则 |
| 方案 | `plan/` | 产品/架构/reference/阶段目标 |
| 执行计划 | `docs/plans/` | 日期化计划、推进记录、收口说明 |
| 脚本说明 | `scripts/README.md` | CLI 使用、运营 runbook |
| 用户入口 | `README.md` | 项目简介和本地启动 |

禁止新增 `docs/plan/` 单数目录。

## 单一真源矩阵

遇到冲突时按下表判断，不靠“哪个文件更新得近”简单覆盖：

| 主题 | 第一真源 | 同步对象 |
| --- | --- | --- |
| 产品与阶段目标 | `plan/00-overview.md`、`plan/step-*.md` | `standard/`、`docs/plans/` |
| DB schema / JSON 字段 | Drizzle schema、migration、`plan/reference-schema.md` | API、测试、standard |
| API 契约 | OpenAPI registry、路由测试、`plan/reference-api.md` | 前端 client、standard |
| UI/UX | `plan/uiux_plan.md` | `standard/04-ui-ux.md`、代码、截图 |
| 配置 | `config/env.ts`、runtime setting definitions | `.env.example`、`plan/reference-config.md` |
| 内容产物命名 | `standard/09-offline-content-artifacts.md`、最新 `docs/plans/*naming*` | scripts README、runbook |
| 未完成任务 | 最新 backlog/followup 文档 | 对应 step/reference 验证清单 |

如果代码现状、plan 和 standard 三者冲突，先写现状说明和决策记录，再改实现或改规范。

## 写作规则

- 重要文档使用中文，保留必要英文术语。
- 文件开头说明范围、状态、日期或适用对象。
- 明确区分“当前已落地”和“目标契约”。
- 使用“必须/禁止/应该/可以”表达约束强度。
- 命令必须给出工作目录或上下文。
- 不写无主语的“后续优化”；必须写 owner 或触发条件。
- 避免八股式价值观段落；每条标准都要能被 review、测试、脚本或人工验收。
- 不把“业内最佳实践”当结论；必须写清为什么适合 Round1 当前约束。

## 计划文档

新增执行计划使用：

```text
docs/plans/YYYY-MM-DD-<topic>.md
```

建议结构：

- Goal。
- Current State。
- Target State。
- Non-goals。
- Tasks。
- Verification。
- Rollback/Risk。

旧计划被新实现覆盖时，必须追加状态说明或归档标记，避免误读。

## 当前态与目标态

文档必须显式区分：

- `现状契约`：当前代码、测试或实跑已经支持。
- `目标契约`：计划要达到，但尚未完全落地。
- `过渡口径`：为兼容旧实现临时存在，并有收口条件。
- `历史记录`：保留审计价值，不再指导新实现。

不得把未挂载 API、未验收 UI、未演练部署写成“已完成”。如果需要保留目标设计，必须写清缺口和下一步验证。

## Reference 文档

以下变化必须同步 reference：

- API 路由和错误码。
- DB schema、状态机、JSON 字段。
- 环境变量。
- 部署结构。
- 内容产物路径。
- UI/UX 决策。

## 外部资料引用

- 技术库、框架、SDK、CLI、云服务信息必须查当前官方文档或 Context7。
- 公司规范参照优先使用官方公开资料。
- 引用资料要写链接，不复制大段原文。
- ByteDance 相关公开参照以 Arco Design 公开仓库/官网为准，不臆造内部规范。
- Google、Microsoft、ByteDance 等外部资料只能作为方法论或设计参照；落地条款必须改写成 Round1 的路径、命令、状态和验收方式。

## 文档验收

文档变更应检查：

- 链接存在。
- 路径与当前仓库一致。
- 没有与 UI/UX 定稿冲突。
- 没有把目标态写成已落地。
- 没有暴露 secret 或真实个人信息。

## 维护节奏

- 每完成一个大项，同步更新对应 `plan/step-*.md` 验证清单。
- 每次发布前检查 `docs/plans/2026-04-26-remaining-unfinished-work.md` 或后续 backlog 是否需要更新。
- 标准目录每次重大架构决策后复核一次。

## Backlog 维护

`docs/plans/2026-04-26-remaining-unfinished-work.md` 或后续替代文件是未完成事项的聚合视图，不是唯一真源。维护规则：

- 每完成一项，先更新对应 `plan/step-*` 或 `plan/reference-*`，再更新 backlog 摘要。
- 新增未完成项必须写明触发来源：计划缺口、代码审计、测试失败、上线演练或用户需求。
- 已延期事项必须标记 `deferred`，并说明重新启动条件。
- 已阻塞事项必须标记 `blocked`，并说明外部依赖和临时防护。
- 不把 wishlist 混入主 backlog；没有明确用户价值或风险依据的想法进入单独 brainstorm/idea 文档。

## 文档变更触发器

以下变更必须同步文档：

- 新增或删除路由、环境变量、数据库表、状态值、脚本参数。
- 改变错误码、权限边界、导入产物格式、配置优先级。
- 改变页面 IA、核心文案、可见 feature flag 行为。
- 改变部署拓扑、备份恢复、健康检查、Sentry/日志策略。
- 引入新的外部服务、LLM provider、邮件/OIDC 供应商。

若暂时不更新，PR 必须写明为什么不会造成使用者误操作。

## 写作风格

参考 Microsoft Writing Style Guide 的现代技术写作原则，Round1 文档应：

- 简洁直接。
- 用主动语态。
- 先结论后细节。
- 避免责备用户。
- 对操作步骤给出可执行命令。
- 对目标态和现状态明确区分。
- 对风险写清影响和缓解方式。

## 状态标签

计划文档建议使用以下状态词：

- `目标契约`：计划要达到，但未必已实现。
- `现状契约`：当前代码已挂载或已验证。
- `legacy`：历史遗留，只为兼容存在。
- `blocked`：受外部条件阻塞。
- `deferred`：明确延期，不是遗忘。

## 文档 Review 检查清单

- 是否有范围和状态。
- 是否引用正确路径。
- 是否把未实现能力写成已完成。
- 是否包含验证方式。
- 是否与 standard 冲突。
- 是否有过期路径或旧术语。
- 是否出现 secret 或隐私数据。
- 是否能被执行者按步骤完成。
- 是否写清现状缺口，而不是只描述理想形态。

## 链接和路径

- 本地文件路径使用仓库相对路径。
- final 回复给用户时可使用绝对路径链接。
- Markdown 内部链接必须指向存在文件。
- 计划文档引用代码时尽量具体到文件。

## 归档规则

旧计划不删除，除非确认为重复且无审计价值。归档方式：

- 文件顶部追加状态说明。
- 指向替代计划或已落地 PR。
- 保留原始任务列表，避免历史断链。
