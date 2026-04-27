# 源代码风格规范

## 目标

让 Round1 代码在多人和 AI agent 协作下仍保持可读、可审查、可测试、可长期维护。本规范参考 Google TypeScript Style Guide 的一致性原则，并结合当前仓库 ESLint、Prettier、TypeScript strict 配置。

## 格式化

以 `prettier.config.js` 为唯一格式化真源：

```js
semi: true
singleQuote: false
trailingComma: "all"
printWidth: 100
tabWidth: 2
```

禁止手工改成另一套格式。Tailwind class 排序交给 `prettier-plugin-tailwindcss`。

## TypeScript 基线

- 必须使用 TypeScript，不新增普通 JavaScript 源文件，除非工具链要求 `.mjs/.cjs`。
- 必须保持 `strict`、`noUncheckedIndexedAccess`、`noUnusedLocals`、`noUnusedParameters`。
- 默认使用 `const`；只有需要重新赋值时使用 `let`；禁止 `var`。
- 每个变量声明只声明一个变量。
- 不使用 `any`，除非接入第三方未知结构且有边界校验；使用时必须有注释说明。
- `unknown` 必须先缩小类型再使用。
- 公共 API 类型必须显式导出，内部推导类型可用 `typeof schema.$inferSelect` 等模式。

## 命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 变量/函数 | camelCase | `buildImportSummary` |
| React 组件 | PascalCase | `AdminImports` |
| 类型/interface | PascalCase | `ExamResultPayload` |
| 常量枚举值 | SCREAMING_SNAKE_CASE 或领域既有值 | `ROUND1_FORBIDDEN` |
| 文件 | 遵循目录惯例 | `ExamResult.tsx`、`admin.ts` |
| DB 字段 | snake_case | `prebuilt_paper_id` |

禁止：

- `IUser` 这类匈牙利式接口前缀。
- `_private` 伪私有命名。
- `data2`、`newData`、`tmp` 这类无业务含义名称进入提交代码。
- 名称重复编码类型信息，如 `stringUserId`。

## 文件结构

TypeScript 文件推荐顺序：

1. imports。
2. 常量和本文件私有类型。
3. schema/配置。
4. 主导出函数或组件。
5. 辅助函数。

禁止在一个文件里混合多个无关领域。超过约 300 行且出现多个独立职责时，应拆分。

## 函数

- 函数应只做一件事。
- 参数超过 3 个时，优先改为对象参数。
- 复杂分支应提取为具名 helper。
- 不把异常控制流隐藏在返回 `null` 中；业务失败使用稳定错误码或 discriminated union。
- 纯函数优先；副作用集中在路由 handler、service、mutation、effect 或 CLI 边界。

## 注释

注释解释“为什么”，不要复述“做什么”。

应该写注释：

- 业务状态机或并发 CAS。
- 安全边界和故意保守策略。
- 与 plan/reference 的目标契约差异。
- 临时兼容逻辑和移除条件。

禁止：

- 大段过期注释。
- 注释掉不用的代码。
- 用注释掩盖难读实现；应优先简化代码。

## 错误处理

- 后端业务错误必须映射稳定 `ROUND1_*` 错误码。
- 前端必须把错误码转换为用户可理解文案。
- CLI 必须以非 0 exit code 表达失败。
- 不吞掉异常；至少记录上下文或向调用方返回可行动错误。

## 依赖

- 新依赖必须说明用途、替代方案、包体/安全影响。
- 前端新增大依赖必须 lazy load 或证明首屏必要。
- 不重复引入现有能力相同的库。
- 不为一个小 helper 引入重依赖。

## 生成代码与机器产物

- 生成代码必须标记来源和生成命令。
- 机器产物不得手改；手改必须转为源配置或脚本。
- 大型 JSON 资产按 [09-offline-content-artifacts.md](09-offline-content-artifacts.md) 管理。

## Review 检查清单

- 名称是否能表达业务语义。
- 函数是否过长或承担多职责。
- 类型是否真实约束运行时数据。
- 错误路径是否可见且可测试。
- 是否有不必要抽象。
- 是否保留了 prebuilt-only、安全、UI/UX 等硬约束。
- 是否有对应测试或说明为何不能自动化。

