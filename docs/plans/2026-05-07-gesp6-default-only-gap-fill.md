# 2026-05-07 GESP-6 Default-Only Gap Fill

Status: completed

## Summary

This run continued the 2026 question-bank inventory fill for GESP-6 using the standard offline pipeline:

1. LLM question generation
2. LLM review pass 1
3. LLM review pass 2
4. duplicate checks and database import
5. inventory refresh

The batch used `--provider-lane default-only`, so generation, repair, and both review passes used `.env` `LLM_PROVIDER_DEFAULT`.

## Results

- Run id: `2026-05-07-bulk36-gesp6-default-only-gap-fill-v01`
- Scope: GESP-6 `single_choice` / `medium` / `ALG`
- Bundles generated: 12
- Questions generated: 36
- Bundle size: 3 questions
- Generation report: `artifacts/reports/2026/runs/2026-05-07-bulk36-gesp6-default-only-gap-fill-v01/2026-05-07-bulk36-gesp6-default-only-gap-fill-v01__report__llm-question-generation-review.json`
- Import dry-run: 12 files validated, 0 failed, 0 duplicate content hashes
- Import apply: 36 questions imported, 0 failed
- Run-local inventory evidence: `artifacts/reports/2026/runs/2026-05-07-bulk36-gesp6-default-only-gap-fill-v01/inventory-after/question-inventory.json`
- Canonical current count surface: `count/state/question-inventory.json` and `count/question-counts-current.json`

## Continuation Results

- Run id: `2026-05-07-bulk36-gesp6-default-only-gap-fill-v02`
- Bundle label: `a02` to avoid reusing the earlier `bulk36-a01-b0001...b0012` bundle paths
- Scope: GESP-6 `single_choice` / `medium` / `ALG`
- Bundles generated: 12
- Questions generated: 36
- Bundle size: 3 questions
- Generation report: `artifacts/reports/2026/runs/2026-05-07-bulk36-gesp6-default-only-gap-fill-v02/2026-05-07-bulk36-gesp6-default-only-gap-fill-v02__report__llm-question-generation-review.json`
- Import dry-run: 12 files validated, 0 failed, 0 duplicate content hashes
- Import apply: 36 questions imported, 0 failed
- Run-local inventory evidence: `artifacts/reports/2026/runs/2026-05-07-bulk36-gesp6-default-only-gap-fill-v02/inventory-after/question-inventory.json`
- Canonical current count surface: `count/state/question-inventory.json` and `count/question-counts-current.json`
- Papers inventory after: `count/other-inventories/papers/papers-inventory.json`

## Inventory Delta

- Total non-real-paper deficit: 7566 -> 7530
- Bundle files found: 3024 -> 3036
- Counted exam-tagged question rows: 13585 -> 13621
- GESP-6 `single_choice|medium|ALG`: available 30 -> 66, deficit 195 -> 159

## Continuation Inventory Delta

- Total non-real-paper deficit: 7530 -> 7494
- Bundle files found: 3036 -> 3048
- Counted exam-tagged question rows: 13621 -> 13657
- GESP-6 `single_choice|medium|ALG`: available 66 -> 102, deficit 159 -> 123
- Papers inventory for this run-local snapshot: 3048 generated bundles/files, 13657 questions/items, 0 duplicates, 0 invalid files

## Current Canonical Count

Current maintained question-count statistics have moved to `count/`. The
post-audit canonical files are `count/question-counts-current.*`,
`count/state/question-inventory.*`, and
`count/snapshots/2026-05-07-non-real-question-audit.*`. These current files
include the later diversity smoke bundle and therefore show 3049 bundle files
and 13660 exam-tagged rows while keeping total raw deficit at 7494.

## Follow-Up

The remaining GESP-6 deficit after these batches is still large. Continue in small shards, keeping `--per-bundle 3`, `--max-concurrency 1`, and `--provider-lane default-only` when the requirement is to use only the default provider lane. For another same-day `bulk36` continuation, use a fresh `--agent-label` or distinct pipeline label; `--skip-existing` should only be used when intentionally resuming the exact same bundle label.
