# 真题题库复核推进记录

> 日期：2026-04-26
>
> 范围：`papers/real-papers/csp-j`、`papers/real-papers/csp-s`、`papers/real-papers/gesp`
>
> 依据：`plan/reference-paper-audit.md`

## 本批处理

- 修正 `scripts/auditRealPapers.ts` 官方答案比对：选项字母槽位按 A-D 大小写无关比较，避免 Luogu 官方返回小写选项字母时产生假阳性。
- 修正 `papers/real-papers/gesp/level-1-202412.json` 第 18 题：本地答案从 A 改为官方 B，并把解析调整为“基本类型输入后不保证原始文本逐字原样输出”的理由。
- 修正 `papers/real-papers/gesp/level-5-202409.json` 第 10 题：补齐官方题面中“`merge` 函数调用次数”问句，答案从 D 改为 B，并重写解析，区分调用次数 `O(n)` 与总时间复杂度 `O(n log n)`。
- 补充 `scripts/tests/auditRealPapersAnswers.test.ts`，覆盖答案槽位大小写归一化与非选项文本保留。

## 验证结果

- `npx tsx scripts/reviewRealPapers.ts --file gesp/level-1-202412.json --start-q 18 --end-q 18 --write --chunk-size 1 --timeout 360000`：GESP 单选已修复样本通过，`applied=1 skipped=0 warnings=0`。
- `npx tsx scripts/reviewRealPapers.ts --file gesp/level-5-202409.json --start-q 10 --end-q 10 --write --chunk-size 1 --timeout 360000`：GESP 阅读程序已修复样本通过，`applied=1 skipped=0 warnings=0`。
- `npx tsx scripts/reviewRealPapers.ts --file gesp/level-1-202412.json --start-q 7 --end-q 7 --write --chunk-size 1 --timeout 360000`：GESP 完善程序样本通过，`applied=1 skipped=0 warnings=0`。
- `npx tsx scripts/reviewRealPapers.ts --file csp-j/2025.json --start-q 1 --end-q 1 --write --chunk-size 1 --timeout 360000`：CSP-J 样本通过，`applied=1 skipped=0 warnings=0`。
- `npx tsx scripts/reviewRealPapers.ts --file csp-s/2025.json --start-q 1 --end-q 1 --write --chunk-size 1 --timeout 360000`：CSP-S 样本通过，`applied=1 skipped=0 warnings=0`。
- 计划记录中的复跑命令不保留固定 provider 覆盖示例；后续复跑默认使用 `.env` 中的 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` 链路。
- 上述抽样报告均为空数组，无低置信度、`manual_check`、跳过项或警告项。
- `npx tsx scripts/tests/auditRealPapersAnswers.test.ts`：通过。
- `npx tsx scripts/tests/auditRealPapersFilters.test.ts`：通过。
- `npx tsx scripts/tests/auditRealPapersQuality.test.ts`：通过。
- `npx tsx scripts/tests/auditRealPapersMetadata.test.ts`：通过。
- `npx tsx scripts/tests/auditRealPapersStructure.test.ts`：通过。
- `npx tsx scripts/auditRealPapers.ts answers --official --dir csp-j,csp-s,gesp --fail`：`total=3184 empty=0 officialChecked=110 mismatches=0 countMismatches=0 officialMissing=0`。
- `npx tsx scripts/auditRealPapers.ts coverage --dir csp-j,csp-s,gesp --fail`：`total=3194 empty=0`。
- `npx tsx scripts/auditRealPapers.ts code --dir csp-j,csp-s,gesp --fail`：`required=900 missing=0`。
- `npx tsx scripts/auditRealPapers.ts quality --dir csp-j,csp-s,gesp --fail`：`total=0`。
- `npx tsx scripts/auditRealPapers.ts metadata --dir csp-j,csp-s,gesp --fail`：`total=0`。
- `npx tsx scripts/auditRealPapers.ts structure --dir csp-j,csp-s,gesp --fail`：`total=0`。

## 仍需保留的边界

- 本批完成的是全量确定性审计、官方答案比对、发现项修复，以及覆盖 CSP-J、CSP-S、GESP 和三类题型的 LLM/人工语义抽样复核；未对全库逐题执行 LLM 重写。
- GESP 2 级 2025-09 官方源返回 25 个条目，本地为 24 题；当前 `alignOfficialProblems` 可过滤为 24 个可用题并完成比对，后续人工抽样时可继续把该卷列为重点。
