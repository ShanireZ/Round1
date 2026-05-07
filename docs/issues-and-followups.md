# Issues And Follow-ups

Status: active

This is the current register for documentation maintenance issues and cross-cutting follow-ups that should not be buried in dated plans.

## Situation Summary

- `docs/` now has a top-level index, maintenance rules, and this issue register. Generated inventory is maintained under `count/other-inventories/docs/`.
- Existing dated plans are preserved in place for audit value.
- The next maintenance pass should triage old `docs/plans/*.md` files by adding status headers and moving durable rules into `standard/`, `plan/`, or top-level topic docs.

## Register

| id | status | area | source | current situation | next action | close condition |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-001 | open | docs/plans | `npm run inventory:docs -- --write` | 21 older dated plans lack explicit status headers, so readers must infer whether they are active, completed, superseded, or reference-only. | Triage each historical file in `docs/plans/` and add `Status:` plus replacement or closure notes where needed. | `npm run inventory:docs -- --strict` passes, or intentional exceptions are listed here. |
| DOC-002 | open | docs/plans | manual docs review | Some completed implementation records still contain historical task lists and open-looking prose. | Move any live follow-up into this register and mark the source doc `completed`, `superseded`, or `archived`. | No completed record contains unowned live follow-up language. |
| DOC-003 | open | docs root | user request on 2026-05-03 | Topic docs existed without a stable docs entry point or cleanup method. | Keep `docs/README.md`, `docs/maintenance.md`, and `count/other-inventories/docs` updated with every docs layout change. | Two consecutive doc changes update inventory and do not add unindexed root docs. |

## Closed Items

| id | closed at | summary | evidence |
| --- | --- | --- | --- |
| DOC-000 | 2026-05-03 | Established the docs maintenance baseline. | `docs/README.md`, `docs/maintenance.md`, `scripts/audit.ts report-docs-inventory`, and the generated docs inventory now maintained at `count/other-inventories/docs/docs-inventory.md`. |
