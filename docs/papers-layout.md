# Papers Layout

Status: current policy

`papers/` is split into durable content sections and generated inventory metadata.

## Canonical Layout

```text
papers/
  README.md
  _inventory/
    papers-inventory.json
    papers-inventory.md
    sections/
      real-papers.json
      real-papers.md
      <year>.json
      <year>.md
  real-papers/
  <year>/
```

## Sections

- `papers/real-papers/`: historical official papers. These are imported as real-paper sets and are excluded from the generated 20,000-question target.
- `papers/<year>/`: generated question bundles for a single simulated-question library year, such as `2026` or future `2027`.
- `papers/_inventory/`: generated metadata. Do not put importable question bundles here.

Generated question bundles keep the established runId layout:

```text
papers/<year>/<runId>/question-bundles/<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json
```

## Maintenance

Run this after adding, deleting, importing, or deduplicating paper files:

```bash
npm run inventory:papers -- --write
npm run verify:offline-artifacts
```

`scripts/reportPapersInventory.ts` writes root and per-section statistics. The per-section files are the source of truth for:

- `real-papers` file and question counts.
- Each generated year bundle and item counts.
- Question type, exam type, difficulty, and knowledge-point group distributions.
- Exact duplicate content-hash groups that need review.

`scripts/reportQuestionInventory.ts` remains the quota-deficit inventory for generated simulated questions, and currently writes to `artifacts/reports/<year>/state/`.

## Cleanup Policy

Do not move existing generated bundle directories into a new nested layout. Import and audit scripts rely on the `papers/<year>/<runId>/question-bundles/` contract.

Do not delete real-paper duplicate groups just because their normalized content hashes match. Official papers can repeat questions across years or variants, so those groups require manual review.
