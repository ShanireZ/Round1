# Docs Inventory

Status: generated metadata index

This directory stores generated documentation inventory.

Refresh it from the repository root:

```bash
npm run inventory:docs -- --write
```

Files:

- `docs-inventory.json`: machine-readable file list, status headers, task counts, and section counts.
- `docs-inventory.md`: human-readable summary and missing-status list.

Do not write implementation plans or current policy directly in this directory.
