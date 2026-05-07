# Plans

Status: current index

`docs/plans/` stores dated execution plans, implementation records, follow-up audits, and closure notes.

## Rules

- File names must use `YYYY-MM-DD-<topic>.md`.
- New files must include `Status: ...` near the top.
- Dated plans are not the long-term source of truth for stable rules. When a plan produces a durable rule, copy that rule into `standard/`, `plan/`, or a top-level topic doc.
- Do not delete old plans unless they are duplicates with no audit value.
- Do not use an old plan as current guidance without checking its status and replacement links.

## Status Values

- `active`: still being executed.
- `completed`: implemented and verified.
- `superseded`: replaced by a newer plan or standard.
- `archived`: retained only for audit/history.
- `reference`: useful background, not an execution queue.
- `blocked`: waiting on an external condition.
- `deferred`: intentionally postponed until a restart trigger.

## Maintenance

After adding or closing a plan:

```bash
npm run inventory:docs -- --write
```

Use `docs/issues-and-followups.md` for live follow-ups that outlive one dated plan.

The generated plan list lives in `count/other-inventories/docs/docs-inventory.md`.
