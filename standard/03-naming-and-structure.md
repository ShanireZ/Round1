# 命名与目录结构规范

## 总原则

- 名称必须表达业务含义，不使用随手缩写、拼音首字母或无意义编号。
- 外部可见资产使用 ASCII 小写 kebab-case。
- TypeScript 代码使用现有生态惯例：变量/函数 camelCase，类型/组件 PascalCase，常量可用 SCREAMING_SNAKE_CASE。
- 数据库表和列使用 snake_case。
- 环境变量使用 SCREAMING_SNAKE_CASE，并按模块前缀分组。
- 新名称优先复用 `plan/glossary.md`、`plan/reference-*` 和已落地代码中的领域词；确需造新词时必须能解释业务边界。

## 命名决策流程

新增文件、API、字段、状态、配置、脚本参数或 artifact 名称时，按以下顺序决定：

1. 先确认对象属于哪个领域：auth、exam、coach、admin、content、import、config、ops。
2. 从已有术语中选一个名词做主语，再用动词或状态补足语义。
3. 检查同领域是否已有相近名字，避免 `paperPack`、`prebuiltPaperBundle`、`paperBundle` 并存。
4. 检查前后端、DB、OpenAPI、文档是否需要同名或映射名。
5. 如果名称暴露给用户、日志、导出、API 或文件系统，优先选择长期稳定、可搜索、可解释的名字。

命名不要追求短。竞赛、导入、权限、状态机相关名称宁可长一点，也要让 reviewer 一眼看出边界。

## 目录职责

| 目录                         | 职责                                                |
| ---------------------------- | --------------------------------------------------- |
| `client/`                    | React 19 + Vite 前端                                |
| `server/`                    | Express 5 API、服务、DB schema、迁移、运行时 worker |
| `config/`                    | 跨 server/scripts 共享配置真源                      |
| `scripts/`                   | 离线内容生产、导入、迁移、验证、运营脚本            |
| `plan/`                      | 长期方案、reference、阶段计划                       |
| `docs/`                      | 当前文档入口、专题运维说明、问题汇总与日期化计划    |
| `docs/plans/`                | 日期化执行计划、收口记录、临时推进记录              |
| `docs/_inventory/`           | 文档盘点元数据，由 `reportDocsInventory.ts` 生成     |
| `papers/`                    | 持久化 question bundle 审计输入                     |
| `artifacts/prebuilt-papers/` | 持久化 prebuilt paper bundle                        |
| `artifacts/reports/`         | 校验报告、judge 摘要、导入记录导出                  |
| `artifacts/tmp/`             | 可清理临时产物                                      |
| `standard/`                  | 当前规范体系                                        |

## 文件命名

- React 页面：`PascalCase.tsx`，如 `ExamResult.tsx`。
- UI primitives：沿 shadcn 风格小写 kebab 或小写文件名，如 `button.tsx`。
- 后端路由：按资源名小写复数或领域名，如 `exams.ts`、`admin.ts`。
- DB schema：按表或领域小驼峰文件名，如 `prebuiltPapers.ts`。
- 迁移：三位序号 + 动作，如 `013_add_paper_question_slot_points.ts`。序号不得复用；发现重复序号必须在下一次迁移前收口。
- 测试：与被测对象同名加 `.test.ts`；跨模块流程用 `.integration.test.ts`；浏览器流程用 `.spec.ts`。
- 执行计划：`docs/plans/YYYY-MM-DD-<topic>.md`。

## API 命名

- 所有业务 API 使用 `/api/v1/**`。
- 资源集合使用复数：`/exams`、`/attempts`、`/admin/questions`。
- 动作端点只用于无法自然表达为资源状态转换的操作，如 `/submit`、`/publish`、`/archive`、`/copy-version`。
- 错误码统一 `ROUND1_*`，大写 snake case。
- 请求/响应字段使用 camelCase；数据库字段在服务层转换，不把 snake_case 泄露到前端。
- URL path segment 使用小写 kebab-case 或既有复数资源名；query/body 字段使用 camelCase。
- 状态迁移动作使用动词或动词短语，避免用名词伪装动作，例如用 `/copy-version`，不用 `/version-copy`。

## 版本与兼容命名

- API 版本只放在路径第一层：`/api/v1`。不得在字段名中添加 `V2`、`new`、`next` 这类临时词。
- schema 版本使用明确字段：`schemaVersion`、`blueprintVersion`、`versionNo`。
- legacy 名称只能用于兼容旧数据或旧文档，并必须写明替代名称和移除条件。
- 配置、feature flag 和错误码一经前端或运维依赖，不随意重命名；确需重命名时保留兼容期或提供迁移说明。
- `beta`、`experimental` 只能用于内部调试或受控 feature flag，不得出现在稳定用户路径的永久命名里。

## 配置命名

- 应用私有：`ROUND1_*`。
- 数据库：`DATABASE_*`。
- Session：`SESSION_*`。
- Auth：`AUTH_*`。
- LLM：`LLM_*`、`<PROVIDER>_API_KEY`、`<PROVIDER>_BASE_URL`、`<PROVIDER>_MODEL`。
- 邮件：`MAIL_*` 与 provider 专属前缀。
- CppLearn：`CPPLEARN_OIDC_*`。

## 禁止清单

- 禁止把正式可审计文件命名为 `latest.json`、`paper-packs.json`、`probe*.json`。
- 禁止新建 `docs/plan/` 单数目录。
- 禁止在新代码中重新引入 `generation job`、`inventory`、`replacement`、`cooldown` 等旧运行时组卷语义。
- 禁止用 `utils.ts` 容纳跨领域业务逻辑；`utils` 只能放通用、纯函数、小范围工具。
- 禁止使用 `tmp`、`misc`、`common`、`helper` 作为长期目录或文件名，除非内容确实是短生命周期临时产物或无领域纯工具。

## TypeScript 命名细则

| 类型         | 规则                                 | 说明                            |
| ------------ | ------------------------------------ | ------------------------------- |
| 领域服务     | `<domain><Action>Service` 或清晰动词 | `runtimeConfigService`          |
| 路由 schema  | `<domain>.schema.ts`                 | `exams.schema.ts`               |
| 测试 fixture | `<scenario>.sample.json`             | `question-bundle.sample.json`   |
| React hook   | `useXxx`                             | 只在 hook 内调用其他 hooks      |
| Query key    | 领域数组                             | `["admin", "imports", filters]` |
| Error helper | `toXxxError` / `isXxxError`          | 不用模糊 `handleError`          |

避免把类型写进名字：`userId` 足够，不写 `userIdString`。

## 数据库命名细则

- 主键默认 `id`，关联列 `<table_singular>_id`。
- 时间列使用 `_at` 后缀，类型 `TIMESTAMPTZ`。
- JSON 列使用 `_json` 后缀。
- boolean 列使用清晰谓词，如 `sandbox_verified`。
- 多对多表用两个领域名组合：`question_exam_types`、`class_coaches`。
- 状态列统一 `status` 或具体状态名，不混用 `state`。

## 事件与队列命名

- Redis key 必须有前缀：`sess:*`、`rl:*`、`cfg:*`、`bull:*`。
- Redis pub/sub channel 使用领域冒号：`config:change`。
- BullMQ job name 使用 kebab-case：`attempt-auto-submit`。
- 日志 event/action 使用 snake_case 或 kebab-case，但同一表内必须一致。

## Artifact 命名

正式离线资产命名以 [09-offline-content-artifacts.md](09-offline-content-artifacts.md) 为准。简要规则：

- `runId`: `YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN`
- question bundle: `<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`
- prebuilt paper bundle: `<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json`

`papers/` has three stable sections:

- `papers/real-papers/`: official historical paper source JSON, imported as real-paper sets and excluded from generated simulated-question targets.
- `papers/<year>/`: generated question bundles for that simulated library year.
- `papers/_inventory/`: generated paper inventory metadata from `scripts/reportPapersInventory.ts`; it is not an importable bundle area.

## 路径变更规则

移动或重命名文件时必须同步：

- import 路径。
- 测试路径。
- README/plan/reference。
- 脚本帮助文本。
- `00-index.md` 或相关索引。

不得只改文件名而保留旧文档入口。

大范围重命名必须拆成可审查步骤：

1. 先补或更新命名规范。
2. 再做机械 rename，不混入行为变更。
3. 最后更新引用、测试、文档和脚本 help。

如果 rename 会影响持久化路径、导入资产、API 字段或数据库列，必须按 [01-governance.md](01-governance.md) 的 S0/S1 变更处理。
