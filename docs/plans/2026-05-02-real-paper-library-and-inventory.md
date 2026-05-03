# Real Paper Library and 2026 Inventory Plan

## Scope

- Student-facing `<历届真题>` is a separate primary navigation entry next to `<出卷考试>`.
- Real papers use the existing prebuilt-paper clone flow, so each start creates or reuses a draft paper and then enters the same timed runtime.
- Real paper catalog is filtered by published `prebuilt_papers.metadataJson` with `paperKind/sourceType/source=real_paper` or tag `真题`.
- Generated 2026 question bundles default to 3 questions per bundle, with two LLM review passes and up to 6 failed-item repair cycles before regeneration.

## UI Placement

- Route: `/exams/real-papers`.
- Navigation: student primary nav after `/exams/new`.
- Layout:
  - Header summary for total real paper sets and covered exam types.
  - Exam type segmented filter.
  - Year segmented filter.
  - Grouped card grid by exam type.
  - Each card shows exam type, year tag, difficulty, question count, source, and a single `开始/重做` action.

This keeps historical real papers distinct from simulated prebuilt papers, while preserving the same answer/session/result experience.

## Offline Content Flow

1. Run generation with `scripts/generateLlmQuestionBundles2026.ts`.
   - Default `--per-bundle` is now `3`.
   - Default `--max-repair-cycles` is now `6`.
   - JSON bundle is written only after the whole bundle passes formal validation plus review pass 1 and pass 2.
2. Existing 2026 bundles can be batch imported with `scripts/importQuestionBundles2026.ts`.
   - Default mode is a dry run.
   - Use `--run-judge --judge-rounds 2` to supplement missing review evidence before import.
   - Use `--apply` only when the database is reachable and duplicate checks must pass.
3. Historical real paper questions are ingested with `scripts/ingestRealPapers.ts`.
   - Default review rounds: `2`.
   - Content JSON receives `sourceType=real_paper`, `sourceYear`, `sourceExamType`, `sourceFile`, and tags `真题`, `<year>`, `<examType>`.
   - `--dir real-paper` falls back to `papers/real-papers` when the legacy singular folder is absent.

## Inventory Target

- Target simulated prebuilt inventory: 100 papers for each of `CSP-J`, `CSP-S`, `GESP-1` through `GESP-8`.
- Real paper questions are counted separately and excluded from the simulated prebuilt deficit.
- `scripts/reportQuestionInventory.ts` reads `papers/2026` recursively, counts by exam type, question type, difficulty, and knowledge-point group, then compares counts with blueprint quotas.
- `npm run inventory:questions -- --write` writes the current JSON and Markdown inventory to `artifacts/reports/2026/state`.
- Use `--out-run-dir artifacts/reports/2026/runs/<runId>` only when a point-in-time inventory snapshot also needs to be attached to a specific run.
- `scripts/reportPapersInventory.ts` maintains the broader `papers/` section inventory. Run `npm run inventory:papers -- --write` after changing `papers/real-papers` or any `papers/<year>` generated-bundle section. It writes root and per-section statistics to `papers/_inventory`.
