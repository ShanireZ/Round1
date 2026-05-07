# Round1 Count Canonical Index

Status: current counting source

`count/` is the canonical home for Round1 maintained statistics. Use this
folder for current question inventory, quality-adjusted counts, snapshots,
cross-run audits, and generated docs/papers inventories. Historical files under
`artifacts/reports/**` may remain as audit evidence, but they are not the
maintained counting surface.

## Current Files

| Path | Purpose |
| --- | --- |
| `question-counts-current.md` | Human-readable current non-real-paper count and quality summary |
| `question-counts-current.json` | Machine-readable current merged count report |
| `state/question-inventory.md` | Raw inventory and blueprint deficit summary |
| `state/question-inventory.json` | Machine-readable raw inventory and deficit source |
| `audits/<runId>/` | Diversity audit evidence used by the merged count report |
| `audits/similarity/` | Migrated cross-run similarity audit evidence |
| `runs/<runId>/` | Optional point-in-time inventory/counting evidence for a specific run |
| `other-inventories/docs/` | Generated docs inventory |
| `other-inventories/papers/` | Generated papers and real-paper inventory |
| `snapshots/<snapshotId>.md` | Frozen human-readable snapshot |
| `snapshots/<snapshotId>.json` | Frozen machine-readable snapshot |
| `snapshots/<snapshotId>__bucket-details.csv` | Full per exam/type/difficulty/kp bucket detail |
| `audit-standard.md` | Maintained audit method and decision rules |
| `legacy-statistics-index.md` | Migration and retention index for old statistic surfaces |

## Refresh Workflow

```powershell
npm run inventory:questions -- --write
npx tsx scripts/audit.ts audit-question-diversity-2026 --dir papers/2026 --out-dir count/audits/<runId>
npm run count:questions -- --write --diversity-audit count/audits/<runId>/papers-2026__diversity-audit.json --rewrite-queue count/audits/<runId>/papers-2026__rewrite-queue.csv --archive-suggestions count/audits/<runId>/papers-2026__archive-suggestions.csv --snapshot-id <snapshotId>
npm run inventory:docs -- --write
npm run inventory:papers -- --write
```

Use a stable `runId` and `snapshotId` such as
`2026-05-07-non-real-files-all-v01` and
`2026-05-07-non-real-question-audit`.

## Counting Notes

- Unit: exam-tagged rows. A question tagged for multiple exam types is counted
  once per exam type.
- Scope: non-real-paper question bundles under `papers/2026`.
- `rawDeficit` is blueprint quota minus available count, capped at zero per
  bucket.
- `compliant` is an audit estimate: available count minus rewrite queue.
- `abandon` is archive suggestion count. Archive suggestions require manual
  review or replacement before action.
- `salvage` is rewrite queue minus archive suggestions.
- `lowQuality` overlaps with rewrite/archive and must not be added to them.
- `qualityAdjustedDeficit` is required minus compliant, capped at zero per
  bucket.

## Current Snapshot

The current canonical snapshot is
`snapshots/2026-05-07-non-real-question-audit.*`.

## Retention Boundary

- Maintained statistics live in `count/**`.
- `artifacts/reports/**/runs/**` stays as batch-local evidence unless a current
  statistic is intentionally regenerated into `count/runs/<runId>`.
- Cross-run audit statistics belong under `count/audits/**`.
- Generated docs and papers inventories belong under
  `count/other-inventories/**`.
