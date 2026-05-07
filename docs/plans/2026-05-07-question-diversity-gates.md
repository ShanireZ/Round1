# 题库多样性蓝图与三道质量门实施记录

Status: completed

## Goal

把 LLM 模拟题生产从泛化 prompt 改为“蓝图矩阵约束 + 两轮质量 rubric 审核 + 入库前同质化拒收”。第一版不改数据库 schema，不改后台 UI，质量元数据只进入离线 bundle 和报告。

## Implemented

- 新增 `config/questionArchetypes.ts`：为 BAS/CPP/ALG/DS/MATH/CS 建立第一版 archetype catalog，并按 GESP/CSP 蓝图选择 bundle 级出题计划。
- 扩展 question bundle schema：题目 item 可携带 `diversityMeta`，记录 `archetypeId`、`taskFlavor`、代码结构标签、容器标签、normalized template key 和难度质量 rubric。
- `batch-generate-llm --plan-only` 现在输出 `diversityPolicyVersion`、archetype plan、archetype 分布和 taskFlavor 分布；正式生成 prompt 会写入 item 级 archetype directive、reject rules 和难度刻度。
- 两轮 LLM judge 增加质量字段：`reasoningSteps`、`stateVariables`、`conceptCount`、`traceSteps`、`trapType`、`difficultyFit`、`qualityScore`；低质量或 hard 难度不达标进入 repair/regenerate。
- 导入 workflow 在 apply/dry-run 前运行 diversity validator。带新 policy 的 bundle 若出现重复 archetype、参数化模板、hard 伪难度或 shard/grid 占比超限，直接拒收。
- 新增 `audit-question-diversity-2026`：可从 manifest、目录或数据库读取题目，输出 CSP-J/CSP-S 等 examType 的模板分布、低质量候选、参数化模板簇和 rewrite queue。

## Verification

- `npm run test:scripts`
- `npx tsx scripts/questionBundle.ts batch-generate-llm --total 3 --per-bundle 3 --batch-run-id 2026-05-07-diversity-plan-probe-v01 --seed diversity-plan-probe --max-concurrency 1 --provider-lane default-only --plan-only`
- `npx tsx scripts/audit.ts audit-question-diversity-2026 --help`

## Follow-up

- 用 `audit-question-diversity-2026 --db --exam-type CSP-J,CSP-S` 跑一次现有题库审计，生成 rewrite queue 和淘汰建议。
- 按 rewrite queue 小批量重写低分、高重复、hard 难度不达标和 DS stack/queue 过载题。
- 后续把每个 `questionType + kpGroup + difficulty` 的 archetype 从 12 个扩展到 20 个，并把审计结果回填为更细的 archetype selector 权重。
