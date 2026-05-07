# Reports Artifact Layout

Status: current policy

`artifacts/reports` stores audit evidence and run-local reports. Current
question-count state now lives in `count/`; keep this directory structured by
lifecycle, not by whatever command happened to produce a file.

## Canonical Layout

```text
artifacts/reports/
  README.md
  <year>/
    README.md
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

- Current question inventory and quality-adjusted count reports are maintained
  under `count/`, not `artifacts/reports/<year>/state/`.
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

## Current 2026 Count State

`npm run inventory:questions -- --write` writes the raw inventory to
`count/state/question-inventory.json` and `count/state/question-inventory.md`.

`npm run count:questions -- --write ...` writes the merged count surface to
`count/question-counts-current.*` and `count/snapshots/<snapshotId>.*`.

Pass `--out-run-dir count/runs/<runId>` when the same raw inventory snapshot
should also be attached to a specific counting run.
