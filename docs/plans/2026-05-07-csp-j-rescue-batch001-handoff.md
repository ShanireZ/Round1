# 2026-05-07 CSP-J Rescue Batch 001 Handoff

Status: paused
Date: 2026-05-07
Owner: Codex agents
Scope: CSP-J rewrite queue first 100 DB questions, replacement bundle generation only

## Context

用户要求阅读 `plan/`、`standard/`、`count/`，按最新标准和流程，用 `.env` 中的 provider LLM 配置修复 CSP-J 待抢救题目，第一批 100 题；必须多 agents 并行协同，可以参考 `ojcode/luogu`，但不要开新 branch 或 worktree。

本轮按标准边界执行为“离线生成替换 question bundle”，没有直接修改 `questions` 表，没有发布或导入数据库。后续仍需走 bundle validate、import dry-run/apply、管理员 review/publish 链路。

## Standards Applied

- `count/` 是题目数量、rewrite queue、archive suggestion 的当前统计真源。
- LLM 只用于离线内容生产与 judge，不用于运行时出题、换题或直接写库。
- 模型输出只是候选材料；必须经过 JSON/Zod schema、答案结构、去重、hard rubric、diversity、judge 等校验。
- 阅读程序题禁止样例输入/输出；完善程序题保留样例 IO。
- 新产物必须使用 runId 路径：`papers/2026/<runId>/question-bundles/`。
- 不创建其他 branch 或 worktree。

## Parallel Agents Used

- Noether: 梳理 `standard/`、`plan/`、`count/` 的流程约束，确认本批不能直接写库，只能生成可审计替换 bundle。
- Carver: 分析第一批 100 个 rewrite queue 项，确认来源为 `count/audits/diversity-csp-js-2026-05-07/db-questions__rewrite-queue.csv`。
- Ptolemy: 搜索 `D:/WorkSpace/OJCode/Luogu` 中可参考的 DS/ALG/CPP 思路文件，用于 prompt 约束和人工核对。

## Code Path Prepared

已使用现有稳定入口挂载修复命令：

- `scripts/questionBundle.ts`
  - command: `repair-db-rewrite-queue`
- `scripts/commands/repairDbQuestionRewriteQueue.ts`
  - 读取 rewrite queue CSV。
  - 按 `--limit 100 --offset 0 --exam-type CSP-J` 选择第一批。
  - 通过 `scripts/lib/scriptLlmClient.ts` 和 `config/llm.ts` 使用 `.env` provider 链路。
  - 写 `llm_provider_logs`。
  - 每题先 generate 修复候选，再 judge 独立复核。
  - 成功后写单题 replacement question bundle，不直接更新数据库。
  - `--skip-existing` 会复用已存在 bundle，适合中断后恢复。

## Stop Point

Stopped at: 2026-05-07 17:21:46 +08:00

No background `node` / `cmd` process from this batch remained after stopping.

Current report:

```text
artifacts/reports/2026/runs/2026-05-07-csp-j-rescue-batch001/2026-05-07-csp-j-rescue-batch001__report__db-rewrite-replacement-bundles.json
```

Current stdout log:

```text
artifacts/reports/2026/runs/2026-05-07-csp-j-rescue-batch001/repair-db-rewrite-queue.stdout.log
```

Current stderr log:

```text
artifacts/reports/2026/runs/2026-05-07-csp-j-rescue-batch001/repair-db-rewrite-queue.stderr.log
```

stderr was empty at the stop point.

## Current Progress

Report summary at stop:

```json
{
  "selected": 100,
  "missing": 0,
  "repaired": 24,
  "skippedExisting": 18,
  "failed": 1,
  "wrote": 42
}
```

Additional counters:

- report item count: 43
- generated replacement bundle files: 42
- highest processed queue ordinal in report: 42
- question types processed so far:
  - `single_choice`: 42 report items
  - `reading_program`: 1 report item

The first successful replacement bundle path pattern is:

```text
papers/2026/2026-05-07-csp-j-rescue-b0001-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0001-hard-v01__question-bundle__single_choice__ds__n1__v01.json
```

The latest generated bundle paths at stop include:

```text
papers/2026/2026-05-07-csp-j-rescue-b0039-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0039-hard-v01__question-bundle__single_choice__alg__n1__v01.json
papers/2026/2026-05-07-csp-j-rescue-b0040-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0040-hard-v01__question-bundle__single_choice__ds__n1__v01.json
papers/2026/2026-05-07-csp-j-rescue-b0041-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0041-hard-v01__question-bundle__single_choice__ds__n1__v01.json
papers/2026/2026-05-07-csp-j-rescue-b0042-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0042-hard-v01__question-bundle__single_choice__ds__n1__v01.json
papers/2026/2026-05-07-csp-j-rescue-b0043-hard-v01/question-bundles/2026-05-07-csp-j-rescue-b0043-hard-v01__question-bundle__single_choice__math__n1__v01.json
```

## Known Failed Item

One item failed all 5 attempts and has no bundle yet:

```text
id: db:0e924e7b-4d10-45e9-9863-21104105fac6
queue ordinal: 37
questionType: single_choice
kpGroup: ALG
reasons: qualityScore_below_0.65 | hard_difficulty_rubric_failed | parameterized_template_cluster
```

Attempt errors:

```text
1. Model output does not contain a JSON object
2. Model output does not contain a JSON object
3. Cannot read properties of undefined (reading 'join')
4. Model output does not contain a JSON object
5. Expected property name or '}' in JSON at position 1 (line 1 column 2)
```

When resuming, `--skip-existing` should skip the 42 existing bundle files and retry this failed item plus the remaining unprocessed queue items.

## Resume Command

Run from `D:/WorkSpace/Round1`.

```powershell
$logDir = 'D:\WorkSpace\Round1\artifacts\reports\2026\runs\2026-05-07-csp-j-rescue-batch001'
$stdout = Join-Path $logDir 'repair-db-rewrite-queue.stdout.log'
$stderr = Join-Path $logDir 'repair-db-rewrite-queue.stderr.log'
$args = @(
  'tsx','scripts\questionBundle.ts','repair-db-rewrite-queue',
  '--limit','100',
  '--max-concurrency','4',
  '--timeout-ms','180000',
  '--max-repair-attempts','5',
  '--skip-existing',
  '--write',
  '--allow-external-llm',
  '--external-llm-consent','artifacts\reports\2026\runs\2026-05-06-question-bank-reconcile-v01\external-llm-consent-env-providers-2026-05-06.json',
  '--external-llm-purpose','csp-j-rescue-batch001'
)
Start-Process -FilePath 'npx.cmd' -ArgumentList $args -WorkingDirectory 'D:\WorkSpace\Round1' -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
```

Use this polling command after resuming:

```powershell
$report = 'D:\WorkSpace\Round1\artifacts\reports\2026\runs\2026-05-07-csp-j-rescue-batch001\2026-05-07-csp-j-rescue-batch001__report__db-rewrite-replacement-bundles.json'
$json = Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
$running = Get-Process | Where-Object { ($_.ProcessName -match 'node|cmd') -and $_.StartTime -gt (Get-Date '2026-05-07T17:21:00') }
$bundleCount = @(Get-ChildItem -Recurse -File -LiteralPath papers\2026 | Where-Object { $_.FullName -like '*2026-05-07-csp-j-rescue-b*\question-bundles\*.json' }).Count
[PSCustomObject]@{
  runningCount = @($running).Count
  summary = $json.summary
  finishedAt = $json.finishedAt
  itemCount = @($json.items).Count
  bundleCount = $bundleCount
  lastLines = Get-Content -LiteralPath artifacts\reports\2026\runs\2026-05-07-csp-j-rescue-batch001\repair-db-rewrite-queue.stdout.log -Tail 30 -Encoding UTF8
  stderrTail = Get-Content -LiteralPath artifacts\reports\2026\runs\2026-05-07-csp-j-rescue-batch001\repair-db-rewrite-queue.stderr.log -Tail 10 -Encoding UTF8
} | ConvertTo-Json -Depth 8
```

## After Batch Completes

Do not treat generated replacement bundles as published content yet. Continue with the normal offline checks:

```powershell
npx tsc --noEmit --pretty false
npx tsx scripts/audit.ts audit-question-diversity-2026 --dir papers/2026 --out-dir count/audits/2026-05-07-csp-j-rescue-batch001
npm run inventory:papers -- --write
npm run inventory:docs -- --write
```

Then update the final execution record in `docs/plans/` and cross-link from `plan/step-03-question-bank.md`.

Known verification caveat from this run: `npx tsc --noEmit --pretty false` reached an existing unrelated TypeScript error in `server/__tests__/admin-audit.middleware.test.ts` around the test `session` mock missing Express session fields (`id`, `cookie`, `regenerate`, `destroy`, etc.).

## Notes for the Next Machine

- Ensure `.env` is present and contains the same provider configuration. The run logged `providers=xiaomi`.
- Ensure the consent JSON path exists:
  `artifacts/reports/2026/runs/2026-05-06-question-bank-reconcile-v01/external-llm-consent-env-providers-2026-05-06.json`.
- On this Windows sandbox, `npx tsx ...` may fail with `spawn EPERM`; rerun with the needed execution permission rather than changing the script.
- Keep `--skip-existing` when resuming. Otherwise the script may spend provider calls on already-written replacement bundles.
- Do not open a new branch or worktree for this task.
