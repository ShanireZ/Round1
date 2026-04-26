# Offline Content And Prebuilt Papers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compatibility-first first implementation of the offline content pipeline, prebuilt paper data model, new admin content APIs, and updated admin information architecture without breaking the still-existing worker-based code paths in one cut.

**Architecture:** Introduce the new runtime model additively first. Create a migration slice that adds `prebuilt_papers`, `prebuilt_paper_slots`, and `import_batches`, then move runtime selection to published prebuilt papers only. The first cut may keep legacy generation/inventory tables compiling, but the target state must converge to `questions.status = draft/reviewed/published/archived`, immutable published paper versions, and a later removal pass for replacement/cooldown/inventory surfaces.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, PostgreSQL, Vitest, React 19, React Router.

**Step Alignment:** Step 03 owns the executable question bundle and prebuilt paper bundle script set, including dry-run/apply command-line imports. Step 05 owns the admin import center, which should bind to the same import summary shape rather than invent a second workflow.

**Current Alignment Gaps:** This plan started from a compatibility slice that exposed legacy question statuses, legacy admin inventory/manual-job endpoints, and replacement/cooldown schema remnants. Those runtime/schema gaps have since been cleaned up; the remaining work is to keep newer features from reintroducing the old semantics.

---

### Task 1: Add Compatibility Migration For New Content Model

**Files:**
- Create: `server/db/migrations/007_offline_content_prebuilt_papers.ts`
- Modify: `server/db/schema/_enums.ts`
- Modify: `server/db/schema/questions.ts`
- Create: `server/db/schema/prebuiltPapers.ts`
- Create: `server/db/schema/prebuiltPaperSlots.ts`
- Create: `server/db/schema/importBatches.ts`
- Modify: `server/db/schema/papers.ts`
- Modify: `server/db/schema/assignments.ts`
- Modify: `server/db/schema/index.ts`

**Step 1: Write the failing test**

Create `server/__tests__/admin-content.integration.test.ts` with a schema-smoke test that imports the new schema symbols and asserts the new admin endpoints can start the app without module import failures.

**Step 2: Run test to verify it fails**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: FAIL because the new schema files and route handlers do not exist.

**Step 3: Write minimal implementation**

Add migration `007_offline_content_prebuilt_papers` that:
- creates `prebuilt_papers`
- creates `prebuilt_paper_slots`
- creates `import_batches`
- adds `published_at` and `archived_at` to `questions`
- widens `questions.status` check from `draft/active/retired/rejected` to `draft/reviewed/published/archived`
- adds nullable `prebuilt_paper_id`, `difficulty`, `created_from` to `papers`
- adds nullable `prebuilt_paper_id` to `assignments`

Add matching Drizzle schema files and exports.

**Step 4: Run test to verify it passes**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: PASS import/startup slice.

### Task 2: Add New Admin Content Route Schemas

**Files:**
- Create: `server/routes/schemas/adminContent.schema.ts`
- Modify: `server/routes/schemas/questionBank.schema.ts`
- Modify: `server/routes/admin.ts`

**Step 1: Write the failing test**

In `server/__tests__/admin-content.integration.test.ts`, add tests for:
- `GET /api/v1/admin/prebuilt-papers`
- `GET /api/v1/admin/import-batches`
- updated `GET /api/v1/admin/questions` accepting `published/archived`

**Step 2: Run test to verify it fails**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: FAIL with 404 or validation mismatch.

**Step 3: Write minimal implementation**

Add schemas for:
- question list query with status `draft/reviewed/published/archived`
- prebuilt paper list query
- import batch list query
- publish/archive body or param contracts if needed

Add route handlers in `server/routes/admin.ts` that return paginated lists from the new tables.

**Step 4: Run test to verify it passes**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: PASS for list endpoints.

### Task 3: Add Question Publish/Archive And Content Library Skeleton

**Files:**
- Modify: `server/routes/admin.ts`
- Possibly create: `server/services/admin/contentLibraryService.ts`

**Step 1: Write the failing test**

Add tests for:
- `POST /api/v1/admin/questions/:id/publish`
- `POST /api/v1/admin/questions/:id/archive`
- `GET /api/v1/admin/questions/:id` returning exam types and lifecycle fields

**Step 2: Run test to verify it fails**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: FAIL because routes or status transitions are missing.

**Step 3: Write minimal implementation**

Implement CAS-style updates for question publish/archive. Preserve existing auth/adminAudit middleware patterns.

**Step 4: Run test to verify it passes**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: PASS.

### Task 4: Add Prebuilt Paper Library Skeleton

**Files:**
- Modify: `server/routes/admin.ts`
- Possibly create: `server/services/admin/prebuiltPaperService.ts`

**Step 1: Write the failing test**

Add tests for:
- `POST /api/v1/admin/prebuilt-papers`
- `GET /api/v1/admin/prebuilt-papers/:id`
- `POST /api/v1/admin/prebuilt-papers/:id/publish`
- `POST /api/v1/admin/prebuilt-papers/:id/archive`

**Step 2: Run test to verify it fails**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: FAIL because routes and inserts are missing.

**Step 3: Write minimal implementation**

Implement draft create, detail read, and publish/archive lifecycle updates for prebuilt papers.

**Step 4: Run test to verify it passes**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`
Expected: PASS.

### Task 5: Update Admin Information Architecture In React

**Files:**
- Modify: `client/src/router.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Create: `client/src/pages/admin/AdminDashboard.tsx`
- Create: `client/src/pages/admin/AdminQuestionLibrary.tsx`
- Create: `client/src/pages/admin/AdminPaperLibrary.tsx`
- Create: `client/src/pages/admin/AdminImports.tsx`

**Step 1: Write the failing test**

If lightweight router tests are not present, use a compile-style validation instead: update route imports first and run the client build as the failing check.

**Step 2: Run test to verify it fails**

Run: `npm run build:client`
Expected: FAIL because the new page components do not exist yet.

**Step 3: Write minimal implementation**

Replace `/admin/jobs` and `/admin/manual-gen` with:
- `/admin/questions`
- `/admin/papers`
- `/admin/imports`
- `/admin/review`
- `/admin/users`
- `/admin/settings`

Add minimal but structured admin placeholder pages that reflect the new content model.

**Step 4: Run test to verify it passes**

Run: `npm run build:client`
Expected: PASS.

### Task 6: Implement Question Bundle Script Set (Step 03 / Phase 8)

**Files:**
- Create: `scripts/lib/bundleTypes.ts`
- Create: `scripts/generateQuestionBundle.ts`
- Create: `scripts/validateQuestionBundle.ts`
- Create: `scripts/importQuestionBundle.ts`
- Reuse: `docs/plans/2026-04-24-offline-bundle-scripts-task-list.md`

**Step 1: Write the failing checks**

Start from the stored backlog and write the narrowest executable check for each script entrypoint:
- `tsx scripts/generateQuestionBundle.ts --help`
- `tsx scripts/validateQuestionBundle.ts <bundle-path>`
- `tsx scripts/importQuestionBundle.ts <bundle-path> --dry-run`

**Step 2: Implement the minimal shared bundle types**

Add question bundle DTOs and import summary types in `scripts/lib/bundleTypes.ts`.

**Step 3: Implement generate / validate / import scripts**

Keep `importQuestionBundle.ts` aligned with the same summary shape that `POST /api/v1/admin/import-batches/questions/*` returns.

**Step 4: Run focused verification**

Run:
- `tsx scripts/generateQuestionBundle.ts --help`
- `tsx scripts/validateQuestionBundle.ts <bundle-path>`
- `tsx scripts/importQuestionBundle.ts <bundle-path> --dry-run`

Expected: CLI entrypoints execute and dry-run emits a persisted import summary.

### Task 7: Implement Prebuilt Paper Bundle Script Set (Step 03 / Phase 10)

**Files:**
- Modify: `scripts/lib/bundleTypes.ts`
- Create: `scripts/buildPrebuiltPaperBundle.ts`
- Create: `scripts/validatePrebuiltPaperBundle.ts`
- Create: `scripts/importPrebuiltPaperBundle.ts`
- Reuse: `docs/plans/2026-04-24-offline-bundle-scripts-task-list.md`

**Step 1: Write the failing checks**

Start from the stored backlog and write the narrowest executable check for each script entrypoint:
- `tsx scripts/buildPrebuiltPaperBundle.ts --help`
- `tsx scripts/validatePrebuiltPaperBundle.ts <bundle-path>`
- `tsx scripts/importPrebuiltPaperBundle.ts <bundle-path> --dry-run`

**Step 2: Extend shared bundle types**

Add prebuilt paper DTOs and slot types in `scripts/lib/bundleTypes.ts`.

**Step 3: Implement build / validate / import scripts**

Keep `importPrebuiltPaperBundle.ts` aligned with the same summary shape that `POST /api/v1/admin/import-batches/prebuilt-papers/*` returns.

**Step 4: Run focused verification**

Run:
- `tsx scripts/buildPrebuiltPaperBundle.ts --help`
- `tsx scripts/validatePrebuiltPaperBundle.ts <bundle-path>`
- `tsx scripts/importPrebuiltPaperBundle.ts <bundle-path> --dry-run`

Expected: CLI entrypoints execute and dry-run emits a persisted import summary.

### Task 8: Bind Admin Import APIs To Shared Import Flow (Step 05 / Phase 13.4)

**Files:**
- Modify: `server/routes/admin.ts`
- Modify: `server/routes/schemas/adminContent.schema.ts`
- Modify: `client/src/pages/admin/AdminImports.tsx`
- Reuse: `docs/plans/2026-04-24-offline-bundle-scripts-task-list.md`

**Step 1: Write the failing server and client checks**

Run:
- `npm test -- server/__tests__/admin-content.integration.test.ts`
- `npm run build:client`

Expected: FAIL until the import center is wired to the shared dry-run/apply summary flow.

**Step 2: Reuse the shared import summary shape**

Do not fork a second payload contract in Admin. The UI and API should surface the same import batch summary used by the CLI import scripts.

**Step 3: Run focused verification**

Run:
- `npm test -- server/__tests__/admin-content.integration.test.ts`
- `npm run build:client`

Expected: PASS.

### Task 9: Verify End-To-End First Cut

**Files:**
- Modify: only files touched above

**Step 1: Run focused server tests**

Run: `npm test -- server/__tests__/admin-content.integration.test.ts`

**Step 2: Run client build**

Run: `npm run build:client`

**Step 3: Run targeted migration status**

Run: `npm run migrate:status`

**Step 4: Report gaps honestly**

If legacy worker/inventory code still coexists, document that this is an additive transition cut rather than the final removal pass.

### Task 10: Run Legacy Offline-Only Cleanup Pass

**Files:**
- Modify: `plan/step-03-question-bank.md`
- Modify: `plan/step-04-exam-and-grading.md`
- Modify: `plan/step-05-coach-and-admin.md`
- Modify: `plan/step-06-deployment.md`
- Modify: `plan/reference-schema.md`
- Modify: `plan/reference-api.md`
- Modify: `server/routes/admin.ts`
- Modify: `server/db/schema/questions.ts`
- Modify: `server/db/schema/papers.ts`
- Modify: `server/db/schema/index.ts`
- Delete or deprecate: legacy inventory/manual-generation/replacement surfaces when no longer needed

**Step 1: Write the failing audit checks**

Search for stale runtime surfaces:
- legacy admin routes (`/admin/bucket-counters`, `/admin/manual-jobs`, `/admin/trigger-inventory`, `/admin/generation-jobs`)
- replacement/cooldown structures (`paper_question_replacements`, `replacement_count`, `exam_cooldowns`)
- lifecycle drift away from `draft/reviewed/published/archived` if it reappears in new code

**Step 2: Remove stale runtime surfaces**

Delete or hard-deprecate online inventory, online generation, online replacement, and online cooldown behavior. Keep BullMQ only for exam-session runtime jobs such as auto-submit.

**Step 3: Finish model convergence**

Move the question lifecycle to `draft/reviewed/published/archived`, add explicit prebuilt paper versioning semantics, and make “copy new version” the only edit path for published paper assets.

**Step 4: Re-verify references and implementation**

Run:
- `npm test -- server/__tests__/admin-content.integration.test.ts`
- `npm run build:server`
- `npm run migrate:status`
- a targeted grep audit over `plan/**` and `server/**`

Expected: no stale online-generation or online-replacement surfaces remain except explicitly allowed runtime worker tasks.