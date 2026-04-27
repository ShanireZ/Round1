# 命名与目录结构规范

## 总原则

- 名称必须表达业务含义，不使用随手缩写、拼音首字母或无意义编号。
- 外部可见资产使用 ASCII 小写 kebab-case。
- TypeScript 代码使用现有生态惯例：变量/函数 camelCase，类型/组件 PascalCase，常量可用 SCREAMING_SNAKE_CASE。
- 数据库表和列使用 snake_case。
- 环境变量使用 SCREAMING_SNAKE_CASE，并按模块前缀分组。

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `client/` | React 19 + Vite 前端 |
| `server/` | Express 5 API、服务、DB schema、迁移、运行时 worker |
| `config/` | 跨 server/scripts 共享配置真源 |
| `scripts/` | 离线内容生产、导入、迁移、验证、运营脚本 |
| `plan/` | 长期方案、reference、阶段计划 |
| `docs/plans/` | 日期化执行计划、收口记录、临时推进记录 |
| `papers/` | 持久化 question bundle 审计输入 |
| `artifacts/prebuilt-papers/` | 持久化 prebuilt paper bundle |
| `artifacts/reports/` | 校验报告、judge 摘要、导入记录导出 |
| `artifacts/tmp/` | 可清理临时产物 |
| `standard/` | 当前规范体系 |

## 文件命名

- React 页面：`PascalCase.tsx`，如 `ExamResult.tsx`。
- UI primitives：沿 shadcn 风格小写 kebab 或小写文件名，如 `button.tsx`。
- 后端路由：按资源名小写复数或领域名，如 `exams.ts`、`admin.ts`。
- DB schema：按表或领域小驼峰文件名，如 `prebuiltPapers.ts`。
- 迁移：三位序号 + 动作，如 `011_add_paper_question_slot_points.ts`。序号不得复用；发现重复序号必须在下一次迁移前收口。
- 测试：与被测对象同名加 `.test.ts`；跨模块流程用 `.integration.test.ts`；浏览器流程用 `.spec.ts`。
- 执行计划：`docs/plans/YYYY-MM-DD-<topic>.md`。

## API 命名

- 所有业务 API 使用 `/api/v1/**`。
- 资源集合使用复数：`/exams`、`/attempts`、`/admin/questions`。
- 动作端点只用于无法自然表达为资源状态转换的操作，如 `/submit`、`/publish`、`/archive`、`/copy-version`。
- 错误码统一 `ROUND1_*`，大写 snake case。
- 请求/响应字段使用 camelCase；数据库字段在服务层转换，不把 snake_case 泄露到前端。

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

