# Reports Artifact Layout

Status: current policy

`artifacts/reports` stores audit evidence and long-lived content state. Keep it
structured by lifecycle, not by whatever command happened to produce a file.

## Canonical Layout

```text
artifacts/reports/
  README.md
  <year>/
    README.md
    state/
      question-inventory.json
      question-inventory.md
    audits/
      similarity/
        threshold-075/
          <audit outputs>
    cleanups/
      similarity/
        <cleanup run outputs>
    runs/
      <runId>/
        <generation/import/judge/run-local outputs>
```

## Rules

- `state/` is for current durable status. Files here are overwritten by the
  canonical script for the year. Use it for inventory and other "current truth"
  reports.
- `runs/<runId>/` is for one batch or one investigation. Logs, manifests, judge
  summaries, dry-run exports, and temporary review shards stay here.
- `audits/<topic>/...` is for cross-run audit outputs that may be referenced by
  future cleanup or planning.
- `cleanups/<topic>/...` is for apply/dry-run plans, deletion reports, and
  backups generated while correcting repository or database state.
- Do not put important current-state files directly under
  `artifacts/reports/<year>/` or inside an arbitrary run folder.
- Do not put throwaway probes or scratch JSON here. Use `artifacts/tmp/<year>/`
  for discardable intermediate files.

## Current 2026 State

`scripts/reportQuestionInventory.ts --write` writes the current inventory to
`artifacts/reports/2026/state/question-inventory.json` and
`artifacts/reports/2026/state/question-inventory.md`.

Pass `--out-run-dir artifacts/reports/2026/runs/<runId>` when the same inventory
snapshot should also be attached to a specific run.
