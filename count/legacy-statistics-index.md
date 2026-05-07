# Legacy Statistics Index

Status: current migration index

This file records the 2026-05-07 consolidation of maintained statistics into
`count/`. Future audits should update this index when a new statistic-like
surface is discovered outside `count/`.

## Decision

`artifacts/reports/**` should not be removed wholesale. It contains historical
generation, judge, import, cleanup, and run-local evidence. Current or
maintained statistics are consolidated into `count/**`; historical evidence can
remain outside `count` only when it is not used as the current counting source.

## Consolidated Surfaces

| Former surface | New maintained surface | Action |
| --- | --- | --- |
| `artifacts/reports/2026/state/question-inventory.*` | `count/state/question-inventory.*` | Removed stale state files; regenerated current inventory in `count/state`. |
| `artifacts/reports/2026/audits/*` | `count/audits/*` | Copied cross-run audit directories into `count/audits` and removed the old audit directory. |
| `docs/_inventory/*` | `count/other-inventories/docs/*` | Regenerated docs inventory in `count` and removed the old tracked directory. |
| `papers/_inventory/*` | `count/other-inventories/papers/*` | Regenerated papers inventory in `count` and removed the old ignored directory. |
| target4 replacement/final-fill inventory scripts | `count/runs/2026-05-02T02-05-46-784Z/*` | Copied required target4 manifests/reports/inventories into `count/runs` and updated maintenance scripts to read/write statistic outputs there. |

## Current Generated Inventories

| Surface | Current summary |
| --- | --- |
| `count/other-inventories/docs/docs-inventory.*` | 29 markdown files, 5 root docs, 24 plan docs, 21 files without status headers, 18 open task markers. |
| `count/other-inventories/papers/papers-inventory.*` | real-papers: 116 files, 2828 questions, 97 duplicate groups, 0 invalid files; 2026 generated: 3049 bundles, 13660 items, 0 duplicate groups, 0 invalid files. |
| `count/audits/2026-05-07-non-real-files-all-v01/` | Current full non-real-paper diversity audit used by `count/question-counts-current.*`. |
| `count/audits/diversity-csp-js-2026-05-07/` | Migrated CSP-J/CSP-S database diversity audit, 6 files. |
| `count/audits/diversity-generation-smoke-v05/` | Migrated generation smoke diversity audit, 6 files. |
| `count/audits/diversity-smoke-2026-05-07/` | Migrated smoke diversity audit, 2 files. |
| `count/audits/diversity-smoke-2026-05-07-csp/` | Migrated CSP smoke diversity audit, 2 files. |
| `count/audits/similarity/` | Migrated similarity audit, 7 files. |
| `count/runs/2026-05-02T02-05-46-784Z/` | Migrated target4 manifests, duplicate report, frozen question inventory, replacement inventory, final-fill inventory, final import manifest, and deletion report, 8 files. |

## Retained Historical Evidence

| Surface | Retention reason |
| --- | --- |
| `artifacts/reports/2026/runs/*` | 321 run-local evidence directories for generation, judge, import, repair, and point-in-time review records. |
| `artifacts/reports/2026/2026-*` | Historical LLM review/provider probe reports. Keep as evidence; do not use as current statistics. |
| `artifacts/reports/2026/cleanups/*` | Cleanup evidence and operational reports. Keep as audit history unless superseded by a specific cleanup plan. |

After consolidation, `artifacts/reports` still contains historical evidence by
extension: 3767 JSON files, 374 logs, 29 TSV files, 26 Markdown files, 2 text
files, and 1 PowerShell script.

## Future Audit Rule

When a new statistic-like file appears outside `count/`, classify it first:

- current maintained statistic: move or regenerate it under `count/**`;
- run-local evidence: keep it near the run and link to the canonical `count`
  surface when needed;
- duplicate or stale state: regenerate in `count`, then delete the old copy;
- temporary scratch data: move to `artifacts/tmp/**` or delete when no longer
  needed.
