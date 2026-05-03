# Scripts Consolidation Design

## 背景

Round1 的 scripts 目录已经沉淀出多条相近链路：

- question bundle 的 LLM 生成、本地 acceptance 生成、manual draft 构建、校验、导入、批处理导入与批量 LLM 复核
- prebuilt paper bundle 的构建、校验、导入
- 一批仅用于命名别名的薄封装脚本

现状问题是：

- 对外入口过多，offline、local、LLM 和年份化脚本并存，使用者很难判断该从哪个入口开始
- 相同的 CLI 行为在多个脚本里重复实现，例如 dry-run/apply、数值参数校验、bundle 路径/manifest 读取
- 薄封装脚本没有新增业务价值，只增加维护面

## 目标

- 只保留少数对外稳定入口，按业务链路而不是按实现方式命名
- 抽离通用 CLI 与命令分发逻辑到 lib
- 删除没有独立价值的临时/别名脚本
- 保留现有底层工作流能力，不在本次重构中改变 bundle 业务语义

## 方案

### 1. 对外稳定入口

新增两个主入口：

- scripts/questionBundle.ts
- scripts/prebuiltPaperBundle.ts

questionBundle.ts 负责统一 question bundle 相关链路：

- generate-llm
- generate-acceptance
- build-manual
- validate
- import
- import-batch
- batch-generate-local
- batch-generate-llm
- batch-review-llm
- report-remaining-manifest

prebuiltPaperBundle.ts 负责统一 prebuilt paper bundle 相关链路：

- build
- validate
- import

### 2. 公共逻辑下沉

新增脚本公共库，用于承载：

- 稳定命令分发表与帮助文本
- 对 legacy implementation script 的统一执行
- 通用 CLI flag 解析，例如 --dry-run / --apply 互斥校验
- 通用参数读取与 repoPath 格式化

### 3. 清理策略

直接删除纯别名薄封装脚本：

- scripts/generate-offline-questions.ts
- scripts/build-paper-packs.ts
- scripts/validate-import-artifacts.ts

保留现有底层实现脚本作为内部实现面，但在 README 与 package.json 中不再把它们作为推荐入口暴露。

### 4. 风险控制

- 第一轮只收口入口和 CLI 公共逻辑，不改 question bundle / prebuilt paper bundle 的业务实现
- 为新增 lib 增加脚本级断言测试，优先验证命令分发和 flag 解析
- 每完成一轮入口改造后立即跑窄测试，再跑 lint 与 TypeScript 错误检查

## 非目标

- 本次不合并 real paper 审校链和 similarity 清洗链的业务实现
- 不改动已有 bundle schema、数据库导入语义和 LLM prompt 行为
- 不批量改写历史 plan 文档中的旧脚本命令