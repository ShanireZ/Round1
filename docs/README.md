# Docs

Status: current index

This directory is the working documentation layer for Round1. It holds current operational docs, dated plans, and follow-up records. Generated documentation inventory is maintained under `count/`.

## Layout

```text
docs/
  README.md
  maintenance.md
  issues-and-followups.md
  plans/
    README.md
    YYYY-MM-DD-<topic>.md
  reports-artifacts.md
  papers-layout.md
```

## What Goes Where

- `docs/README.md`: navigation and ownership rules for this directory.
- `docs/maintenance.md`: documentation lifecycle, cleanup, completion, and follow-up rules.
- `docs/issues-and-followups.md`: current issue register and situation summary for doc-maintenance and cross-cutting follow-ups.
- `docs/plans/`: dated execution plans, design notes, follow-up records, and closure records.
- `count/other-inventories/docs/`: generated inventory from `scripts/audit.ts report-docs-inventory`.
- Topic docs such as `papers-layout.md` and `reports-artifacts.md`: stable operating rules for a specific local area.

Long-lived product, architecture, and domain contracts belong in `plan/` or `standard/`. Dated execution records and investigation notes belong in `docs/plans/`.

## Maintenance Commands

Run these after adding, closing, renaming, or cleaning docs:

```bash
npm run inventory:docs -- --write
git diff --check
```

Use strict mode only after old plan files have received explicit status headers:

```bash
npm run inventory:docs -- --strict
```

## Status Headers

New docs must include a status line near the top:

```text
Status: active | current index | completed | superseded | archived | reference | blocked | deferred
```

Older files without a status header are tracked in `count/other-inventories/docs/docs-inventory.md` until they are triaged.
