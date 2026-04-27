# Round1 标准体系总览

> 本目录是 Round1 后续研发、设计、内容生产、运维和 agent 协作的统一规范入口。`docs/plan/` 单数目录在当前仓库中不存在，实际读取范围为 `plan/` 与 `docs/plans/`。

## 适用范围

- 面向 Round1 全仓库：`server/`、`client/`、`config/`、`scripts/`、`plan/`、`docs/plans/`、`papers/`、`artifacts/`。
- 适用于人类开发者、AI coding agent、内容生产 agent、代码审查者、运维执行者。
- 新功能、修复、重构、文档、离线内容产物、部署演练均必须对照本目录。

## 规范优先级

1. 安全、隐私、数据完整性、考试公平性相关规则优先于交付速度。
2. UI/UX 已定稿。涉及视觉系统、布局、组件、交互、可达性时，以 `plan/uiux_plan.md` 与 [04-ui-ux.md](04-ui-ux.md) 为最高设计依据，不得随意重设风格。
3. 业务状态机、API、数据库、部署口径以较新的 `plan/step-*`、`plan/reference-*`、`docs/plans/*` 对齐说明为准。
4. 已落地代码与测试体现的现状契约必须被尊重；若规范与现状冲突，应先补 ADR/计划说明，再改代码或改规范。
5. 外部最佳实践只作为方法参照，不覆盖 Round1 已定业务决策。

## 文档清单

| 文件 | 主题 |
| --- | --- |
| [01-governance.md](01-governance.md) | 决策治理、规范变更、例外审批 |
| [02-domain-and-content.md](02-domain-and-content.md) | 产品边界、术语、竞赛内容质量 |
| [03-naming-and-structure.md](03-naming-and-structure.md) | 命名、目录、文件组织 |
| [04-ui-ux.md](04-ui-ux.md) | UI/UX、视觉系统、组件与页面规范 |
| [05-frontend-engineering.md](05-frontend-engineering.md) | React/Tailwind 前端工程规范 |
| [06-backend-api.md](06-backend-api.md) | Express API、错误、OpenAPI、调用规范 |
| [07-data-and-migrations.md](07-data-and-migrations.md) | PostgreSQL/Drizzle、状态机、迁移 |
| [08-security-auth-permissions.md](08-security-auth-permissions.md) | 认证、授权、CSRF、OIDC、step-up |
| [09-offline-content-artifacts.md](09-offline-content-artifacts.md) | 离线内容生产、bundle、runId 产物命名 |
| [10-llm-agents-prompts.md](10-llm-agents-prompts.md) | LLM、prompt、内容 agent、模型调用 |
| [11-testing-quality.md](11-testing-quality.md) | 测试分层、质量门禁、验收 |
| [12-observability-audit.md](12-observability-audit.md) | 日志、Sentry、审计、可追溯 |
| [13-config-env.md](13-config-env.md) | 配置、环境变量、运行时设置 |
| [14-deployment-ops.md](14-deployment-ops.md) | 部署、运维、备份、回滚 |
| [15-performance-accessibility-print.md](15-performance-accessibility-print.md) | 性能、可达性、打印与浏览器兼容 |
| [16-git-review-release.md](16-git-review-release.md) | Git、代码评审、发布与回归 |
| [17-docs-plan-maintenance.md](17-docs-plan-maintenance.md) | 文档、计划、知识库维护 |
| [18-agent-and-tool-calling.md](18-agent-and-tool-calling.md) | AI agent 协作、工具调用、执行边界 |
| [19-source-code-style.md](19-source-code-style.md) | TypeScript、注释、复杂度、格式化与代码组织 |
| [20-product-state-and-workflow.md](20-product-state-and-workflow.md) | 产品流程、状态机、幂等与业务不变量 |
| [21-privacy-and-data-lifecycle.md](21-privacy-and-data-lifecycle.md) | 隐私、数据生命周期、日志脱敏与导出 |
| [22-standard-adoption-and-audit.md](22-standard-adoption-and-audit.md) | 标准采纳、PR 审计、漂移治理与持续改进 |

## 关键词

- **必须**：无例外执行；违反即阻塞合并或上线。
- **禁止**：不得出现；如已有遗留实现，必须标记为 legacy 并计划移除。
- **应该**：默认执行；例外需在 PR/计划中说明理由。
- **可以**：允许但不强制；不得破坏更高优先级规则。
- **例外**：必须记录原因、影响面、回滚方式和后续收口计划。

## 外部参照

本规范吸收以下公开资料的方法论，但已按 Round1 现状重写为项目规范：

- Google Engineering Practices: <https://google.github.io/eng-practices/>
- Google HTML/CSS Style Guide: <https://google.github.io/styleguide/htmlcssguide.html>
- Google JavaScript Style Guide: <https://google.github.io/styleguide/jsguide.html>
- Material Design: <https://m3.material.io/>
- Microsoft Writing Style Guide: <https://learn.microsoft.com/en-us/style-guide/welcome/>
- Microsoft Azure Well-Architected Framework: <https://learn.microsoft.com/en-us/azure/well-architected/>
- Microsoft Fluent 2 Design System: <https://fluent2.microsoft.design/>
- Microsoft REST API Guidelines: <https://github.com/microsoft/api-guidelines>
- ByteDance ByteStyles public values: <https://www.bytedance.com/api/>
- Arco Design / ByteDance public design system repo: <https://github.com/arco-design/arco-design>
- React docs: <https://react.dev/>
- Tailwind CSS docs: <https://tailwindcss.com/docs>
- Express docs: <https://expressjs.com/>
- Drizzle ORM docs: <https://orm.drizzle.team/>

## 外部实践落地方式

- Google 工程实践强调代码健康、清晰命名、适当测试、评审速度与友善评论；Round1 落地为 [16-git-review-release.md](16-git-review-release.md) 的评审优先级和 [19-source-code-style.md](19-source-code-style.md) 的代码可读性要求。
- Google Style Guides 强调一致性、可维护性和可工具化格式；Round1 落地为 ESLint/Prettier/TypeScript strict 与单一格式规范。
- Microsoft REST API Guidelines 强调一致的资源建模、错误语义、版本化与长期兼容；Round1 落地为 [06-backend-api.md](06-backend-api.md) 的 envelope、错误码、分页、OpenAPI 和兼容策略。
- Microsoft Azure Well-Architected Framework 强调标准化开发、可观测性、安全部署和持续改进；Round1 落地为 [12-observability-audit.md](12-observability-audit.md)、[14-deployment-ops.md](14-deployment-ops.md)、[22-standard-adoption-and-audit.md](22-standard-adoption-and-audit.md) 的信号、发布、回滚和漂移治理。
- Microsoft Fluent 2 强调 token、组件、可达性、设计到开发一致性；Round1 落地为 [04-ui-ux.md](04-ui-ux.md)、[15-performance-accessibility-print.md](15-performance-accessibility-print.md) 的 UI 验收。
- Arco Design 公开资料强调企业级组件、主题 token、自定义物料和中后台效率；Round1 落地为 shadcn/Radix 原子组件、`/dev/ui-gallery`、Admin/Coach utility 页面一致性。
- ByteDance 公开 ByteStyles 中的敏捷、效率、简洁、事实驱动和坦诚沟通，只作为组织协作参照；Round1 落地为小步可验证 PR、少流程但有审计、用数据和现状契约说话，不臆造或引用未公开内部规范。
- 大型工程组织普遍要求决策可追溯、例外有期限、标准可自动化检查；Round1 落地为 [20-product-state-and-workflow.md](20-product-state-and-workflow.md)、[21-privacy-and-data-lifecycle.md](21-privacy-and-data-lifecycle.md)、[22-standard-adoption-and-audit.md](22-standard-adoption-and-audit.md) 的状态机、隐私和采纳审计。

## 最小执行流程

1. 需求进入时，先确认是否触碰 UI/UX、考试状态机、安全、数据迁移、离线内容产物或部署。
2. 找到本目录对应规范，列出必须满足的硬约束。
3. 实现前写清测试与验收路径；高风险变更先补计划或 ADR。
4. 实现后运行对应检查：lint、typecheck、unit、integration、E2E、视觉、迁移演练或部署演练。
5. PR/提交说明必须写明：变更内容、原因、验证结果、未覆盖风险。
