# Documentation Maintenance

Status: current policy

This file defines how `docs/` stays useful after plans are implemented, blocked, or replaced.

## Core Rules

- Keep `docs/README.md` as the entry point.
- Keep `docs/issues-and-followups.md` as the current issue and situation register.
- Keep dated work records in `docs/plans/`.
- Keep generated documentation inventory in `docs/_inventory/`.
- Do not create `docs/plan/`; the only dated plan directory is `docs/plans/`.

## Lifecycle

Every maintained doc should have one visible status:

| status | meaning | required follow-up |
| --- | --- | --- |
| `active` | Work is still being executed. | Keep owner, scope, and next action current. |
| `current index` | Navigation or summary entry point. | Update when layout changes. |
| `current policy` | Current operating rule. | Update related `standard/` when it becomes a hard rule. |
| `reference` | Useful background, not an execution queue. | Link to current policy or implementation. |
| `completed` | Work is finished and evidence is recorded. | Link verification and close related issues. |
| `superseded` | A newer doc replaces it. | Link the replacement. |
| `archived` | Preserved for audit only. | Do not use as current guidance. |
| `blocked` | Cannot proceed without an external condition. | Name the blocker and temporary mitigation. |
| `deferred` | Intentionally postponed. | Name the restart trigger. |

## New Plan Template

```markdown
# <Title>

Status: active
Date: YYYY-MM-DD
Owner: <role/person>
Scope: <short scope>

## Current State

## Target State

## Non-goals

## Tasks

## Verification

## Follow-up / Closure
```

## Completion Rules

A plan can be marked `completed` only when:

- The implementation or decision has landed.
- Verification evidence is recorded in the plan or linked from it.
- Follow-up items have either been closed or moved to `docs/issues-and-followups.md`.
- Stable rules have been copied into `standard/`, `plan/`, or a topic doc if they should guide future work.

Do not mark a plan complete just because active coding stopped.

## Cleanup Rules

- Prefer adding a status header and replacement link over deleting old plans.
- Delete a doc only when it is a duplicate with no independent audit value.
- Merge overlapping docs when they describe the same current policy. Keep the clearer title and add a short note to the merged doc.
- Move reusable rules out of dated plans into `standard/`, `plan/`, or a top-level topic doc.
- Do not leave important current status hidden only in a dated plan.

## Issue Register Rules

Use `docs/issues-and-followups.md` for cross-cutting items that should survive a single coding session:

- unresolved doc maintenance gaps,
- blocked operational or content work,
- repeated failure modes,
- cleanup decisions that should not be forgotten,
- follow-ups that are not yet ready for a dated implementation plan.

Every issue row needs an ID, status, owner or trigger, source, current situation, next action, and close condition.

## Inventory Rules

Refresh the inventory after doc changes:

```bash
npm run inventory:docs -- --write
```

The inventory is not a replacement for human judgment. It highlights missing status headers, open task markers, and plan counts so maintainers can decide what to close, supersede, or archive.
