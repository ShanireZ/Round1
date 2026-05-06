import fs from "node:fs";
import path from "node:path";

import { pool } from "../../../server/db.js";
import {
  importQuestionBundle,
  loadQuestionBundle,
  validateQuestionBundle,
} from "../../lib/questionBundleWorkflow.js";
import { buildBundleIntegrity, computeChecksum } from "../../lib/bundleTypes.js";

const TARGET_EXAMS = new Set(["CSP-J", "CSP-S", "GESP-1", "GESP-2", "GESP-7", "GESP-8"]);
const REPORT_ROOT = "artifacts/reports/2026";
const AUDIT_DIR = "artifacts/reports/2026/runs/2026-05-05-non-real-question-audit";
const SOURCE_ROOT = "papers/2026";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function repoPath(value) {
  return path
    .relative(process.cwd(), path.resolve(process.cwd(), value))
    .replaceAll(path.sep, "/");
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.resolve(entryPath));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isQuestionBundlePath(value) {
  return (
    typeof value === "string" &&
    value.includes("/question-bundles/") &&
    value.endsWith(".json")
  );
}

function addPath(target, value) {
  if (isQuestionBundlePath(value)) {
    target.add(value.replaceAll("\\", "/"));
  }
}

function bundlePathFromValue(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return value.path ?? value.bundlePath ?? value.sourceBundlePath;
}

function normalizeBundlePath(value) {
  const bundlePath = bundlePathFromValue(value);
  return isQuestionBundlePath(bundlePath) ? bundlePath.replaceAll("\\", "/") : undefined;
}

function pathHasTargetExam(bundlePath) {
  try {
    const bundle = readJson(bundlePath);
    if (TARGET_EXAMS.has(bundle?.meta?.examType)) return true;
    return Array.isArray(bundle?.items)
      ? bundle.items.some((item) =>
          item.examTypes?.some((examType) => TARGET_EXAMS.has(examType)),
        )
      : false;
  } catch {
    return false;
  }
}

function pathHasTargetExamHint(bundlePath) {
  const normalized = bundlePath.replaceAll("\\", "/").toLowerCase();
  return [...TARGET_EXAMS].some((exam) => normalized.includes(exam.toLowerCase()));
}

function pathHasTargetExamOrHint(bundlePath) {
  return fs.existsSync(bundlePath) ? pathHasTargetExam(bundlePath) : pathHasTargetExamHint(bundlePath);
}

function collectReportPaths() {
  const passed = new Set();
  const failed = new Set();
  const superseded = new Set();
  const evidence = new Map();

  function noteEvidence(bundlePath, kind, reportPath) {
    if (!isQuestionBundlePath(bundlePath)) return;
    const normalized = bundlePath.replaceAll("\\", "/");
    const current = evidence.get(normalized) ?? [];
    if (current.length < 5) current.push({ kind, reportPath: repoPath(reportPath) });
    evidence.set(normalized, current);
  }

  for (const file of listJsonFiles(REPORT_ROOT)) {
    const json = readJson(file);
    const base = path.basename(file);

    for (const entry of json?.supersededBundlePaths ?? []) {
      addPath(superseded, entry);
    }

    if (Array.isArray(json?.bundles)) {
      for (const bundle of json.bundles) {
        if (bundle?.finalVerdict === "pass") {
          addPath(passed, bundle.path);
          noteEvidence(bundle.path, "review_report_pass", file);
        } else if (bundle?.finalVerdict === "fail" || bundle?.finalVerdict === "rejected") {
          addPath(failed, bundle.path);
        }
      }
    }

    if (Array.isArray(json?.passedBundles)) {
      for (const bundle of json.passedBundles) {
        addPath(passed, bundle.path);
        noteEvidence(bundle.path, "aggregate_passed_bundle", file);
      }
    }

    if (Array.isArray(json?.failedBundles)) {
      for (const bundle of json.failedBundles) {
        addPath(failed, bundle.path);
      }
    }

    if (base.includes("actual-imported-manifest") || base.includes("passed-manifest")) {
      for (const bundlePath of json?.bundlePaths ?? []) {
        addPath(passed, bundlePath);
        noteEvidence(bundlePath, base.includes("actual") ? "actual_imported_manifest" : "passed_manifest", file);
      }
    }

    if (base.includes("failed-manifest")) {
      for (const bundlePath of json?.bundlePaths ?? []) {
        addPath(failed, bundlePath);
      }
    }

    for (const target of json?.targets ?? []) {
      if (target?.hasExternalPassEvidence === true && target?.matchedBundle?.bundlePath) {
        addPath(passed, target.matchedBundle.bundlePath);
        noteEvidence(target.matchedBundle.bundlePath, "external_pass_target", file);
      }
    }
  }

  const existingPassed = [...passed].filter((bundlePath) => fs.existsSync(bundlePath));
  const existingFailed = [...failed].filter((bundlePath) => fs.existsSync(bundlePath));
  const existingSuperseded = [...superseded].filter((bundlePath) => fs.existsSync(bundlePath));

  const targetPassed = new Set(existingPassed.filter(pathHasTargetExam));
  const targetFailed = new Set(existingFailed.filter(pathHasTargetExam));
  const targetSuperseded = new Set(existingSuperseded.filter(pathHasTargetExam));

  const deletePaths = new Set([...targetSuperseded]);
  for (const bundlePath of targetFailed) {
    if (!targetPassed.has(bundlePath)) {
      deletePaths.add(bundlePath);
    }
  }

  const keepPaths = new Set([...targetPassed].filter((bundlePath) => !deletePaths.has(bundlePath)));

  return {
    keepPaths,
    deletePaths,
    passedPaths: targetPassed,
    failedPaths: targetFailed,
    supersededPaths: targetSuperseded,
    rawPassedPaths: passed,
    rawFailedPaths: failed,
    rawSupersededPaths: superseded,
    evidence,
  };
}

function buildObsoleteReferencePaths(paths) {
  const obsolete = new Set();
  for (const bundlePath of [...paths.rawSupersededPaths, ...paths.rawFailedPaths]) {
    if (!pathHasTargetExamOrHint(bundlePath)) continue;
    if (
      paths.rawPassedPaths.has(bundlePath) ||
      paths.deletePaths.has(bundlePath) ||
      !fs.existsSync(bundlePath)
    ) {
      obsolete.add(bundlePath);
    }
  }
  return obsolete;
}

function filterPathArray(items, obsoletePaths) {
  if (!Array.isArray(items)) return { value: items, removed: 0 };
  const kept = [];
  let removed = 0;
  for (const item of items) {
    const bundlePath = normalizeBundlePath(item);
    if (bundlePath && obsoletePaths.has(bundlePath)) {
      removed += 1;
    } else {
      kept.push(item);
    }
  }
  return { value: kept, removed };
}

function scrubReportReferences(obsoletePaths, apply) {
  const stats = {
    obsoleteReferencePaths: obsoletePaths.size,
    scannedFiles: 0,
    changedFiles: 0,
    removedReferences: 0,
  };
  if (obsoletePaths.size === 0) return stats;

  for (const file of listJsonFiles(REPORT_ROOT)) {
    stats.scannedFiles += 1;
    const json = readJson(file);
    let removed = 0;

    for (const key of ["failedBundles", "rejectedBundles", "supersededBundlePaths"]) {
      if (Array.isArray(json?.[key])) {
        const result = filterPathArray(json[key], obsoletePaths);
        json[key] = result.value;
        removed += result.removed;
      }
    }

    if (Array.isArray(json?.bundles)) {
      const kept = [];
      for (const bundle of json.bundles) {
        const bundlePath = normalizeBundlePath(bundle);
        const isObsoleteVerdict =
          bundle?.finalVerdict === "fail" || bundle?.finalVerdict === "rejected";
        if (bundlePath && isObsoleteVerdict && obsoletePaths.has(bundlePath)) {
          removed += 1;
        } else {
          kept.push(bundle);
        }
      }
      json.bundles = kept;
    }

    if (path.basename(file).includes("failed-manifest") && Array.isArray(json?.bundlePaths)) {
      const result = filterPathArray(json.bundlePaths, obsoletePaths);
      json.bundlePaths = result.value;
      removed += result.removed;
    }

    if (removed > 0) {
      stats.changedFiles += 1;
      stats.removedReferences += removed;
      if (apply) {
        fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      }
    }
  }

  return stats;
}

function contentHashesForBundle(bundlePath) {
  const bundle = readJson(bundlePath);
  return Array.isArray(bundle.items) ? bundle.items.map((item) => item.contentHash) : [];
}

function collectContentHashes(paths) {
  const hashes = new Set();
  for (const bundlePath of paths) {
    if (!fs.existsSync(bundlePath)) continue;
    for (const hash of contentHashesForBundle(bundlePath)) {
      hashes.add(hash);
    }
  }
  return hashes;
}

async function fetchExistingContentHashes() {
  const result = await pool.query("select content_hash from questions");
  return new Set(result.rows.map((row) => row.content_hash));
}

async function importApprovedBundles(paths, deleteContentHashes, apply) {
  const sortedPaths = [...paths].sort((left, right) => left.localeCompare(right));
  const existing = await fetchExistingContentHashes();
  const planned = new Set(existing);
  const stats = {
    consideredBundles: sortedPaths.length,
    importedBundles: 0,
    importedItems: 0,
    skippedExistingBundles: 0,
    skippedDeletedHashItems: 0,
    partiallyFilteredBundles: 0,
    failedBundles: [],
  };

  for (const bundlePath of sortedPaths) {
    try {
      const loaded = await loadQuestionBundle(bundlePath);
      const filteredItems = loaded.bundle.items.filter((item) => {
        if (deleteContentHashes.has(item.contentHash)) {
          stats.skippedDeletedHashItems += 1;
          return false;
        }
        return !planned.has(item.contentHash);
      });

      if (filteredItems.length === 0) {
        stats.skippedExistingBundles += 1;
        continue;
      }

      if (filteredItems.length !== loaded.bundle.items.length) {
        stats.partiallyFilteredBundles += 1;
      }

      let bundle = {
        ...loaded.bundle,
        meta: {
          ...loaded.bundle.meta,
          requestedCount: filteredItems.length,
          integrity: buildBundleIntegrity(filteredItems),
        },
        items: filteredItems,
      };
      const raw = `${JSON.stringify(bundle, null, 2)}\n`;
      let filteredLoaded = {
        ...loaded,
        bundle,
        raw,
        checksum: computeChecksum(raw),
      };

      if (
        filteredItems.some(
          (item) =>
            (item.type === "reading_program" || item.type === "completion_program") &&
            item.sandboxVerified !== true,
        )
      ) {
        const sandboxValidation = await validateQuestionBundle(filteredLoaded, {
          runSandbox: true,
          skipDuplicateChecks: true,
        });
        if (sandboxValidation.errors.length > 0) {
          throw new Error(
            `Bundle validation failed: ${sandboxValidation.errors
              .map((error) => error.code)
              .join(", ")}`,
          );
        }

        const sandboxIndexes = new Set(sandboxValidation.sandboxVerifiedItemIndexes);
        const sandboxedItems = filteredItems.map((item, index) =>
          sandboxIndexes.has(index) ? { ...item, sandboxVerified: true } : item,
        );
        bundle = {
          ...bundle,
          meta: {
            ...bundle.meta,
            validation: {
              ...(bundle.meta.validation ?? {
                validatedAt: new Date().toISOString(),
                validatorVersion: "round1-bundle-validator/2026-04-26.1",
                checksumAlgorithm: "sha256",
              }),
              sandboxVerifiedItemIndexes: [...sandboxIndexes].sort((left, right) => left - right),
            },
            integrity: buildBundleIntegrity(sandboxedItems),
          },
          items: sandboxedItems,
        };
        const sandboxedRaw = `${JSON.stringify(bundle, null, 2)}\n`;
        filteredLoaded = {
          ...filteredLoaded,
          bundle,
          raw: sandboxedRaw,
          checksum: computeChecksum(sandboxedRaw),
        };

        if (apply && filteredItems.length === loaded.bundle.items.length) {
          fs.writeFileSync(bundlePath, sandboxedRaw);
        }
      }

      if (apply) {
        await importQuestionBundle(filteredLoaded, {
          apply: true,
          persistDryRun: false,
          importedBy: null,
          skipDuplicateChecks: true,
        });
      }

      for (const item of filteredItems) {
        planned.add(item.contentHash);
      }
      stats.importedBundles += 1;
      stats.importedItems += filteredItems.length;
    } catch (error) {
      stats.failedBundles.push({
        bundlePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stats;
}

async function promoteApprovedQuestions(approvedHashes, apply) {
  if (approvedHashes.size === 0) {
    return {
      matchedQuestions: 0,
      insertedReviews: 0,
      preservedPassReviews: 0,
      updatedToReviewed: 0,
    };
  }

  const hashes = [...approvedHashes];
  const matched = await pool.query(
    `
      select id, status, content_hash
      from questions
      where source <> 'real_paper'
        and content_hash = any($1::varchar[])
    `,
    [hashes],
  );
  const ids = matched.rows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      matchedQuestions: 0,
      insertedReviews: 0,
      preservedPassReviews: 0,
      updatedToReviewed: 0,
    };
  }

  const existingPass = await pool.query(
    `
      select distinct question_id
      from question_reviews
      where question_id = any($1::uuid[])
        and review_status in ('ai_reviewed', 'confirmed')
    `,
    [ids],
  );
  const passIds = new Set(existingPass.rows.map((row) => row.question_id));
  const idsNeedingReview = ids.filter((id) => !passIds.has(id));
  const idsNeedingStatus = matched.rows
    .filter((row) => row.status === "draft")
    .map((row) => row.id);

  if (!apply) {
    return {
      matchedQuestions: ids.length,
      insertedReviews: idsNeedingReview.length,
      preservedPassReviews: passIds.size,
      updatedToReviewed: idsNeedingStatus.length,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let insertedReviews = 0;
    if (idsNeedingReview.length > 0) {
      insertedReviews = Number(
        (
          await client.query(
            `
              insert into question_reviews (
                question_id,
                review_status,
                ai_confidence,
                reviewer_notes,
                reviewed_at
              )
              select
                unnest($1::uuid[]),
                'ai_reviewed',
                1,
                'Backfilled from approved local review evidence during obsolete question cleanup.',
                now()
            `,
            [idsNeedingReview],
          )
        ).rowCount ?? 0,
      );
    }

    let updatedToReviewed = 0;
    if (idsNeedingStatus.length > 0) {
      updatedToReviewed = Number(
        (
          await client.query(
            `
              update questions
              set status = 'reviewed',
                  updated_at = now()
              where id = any($1::uuid[])
                and status = 'draft'
            `,
            [idsNeedingStatus],
          )
        ).rowCount ?? 0,
      );
    }
    await client.query("commit");
    return {
      matchedQuestions: ids.length,
      insertedReviews,
      preservedPassReviews: passIds.size,
      updatedToReviewed,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteDbReferences(deleteHashes, apply) {
  const params = [[...deleteHashes]];
  const match = await pool.query(
    `
      select distinct q.id
      from questions q
      left join question_reviews qr on qr.question_id = q.id
      where q.source <> 'real_paper'
        and (
          q.content_hash = any($1::varchar[])
          or q.status = 'archived'
          or qr.review_status = 'rejected'
        )
    `,
    params,
  );
  const ids = match.rows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      matchedQuestions: 0,
      questionReviews: 0,
      questionExamTypes: 0,
      questionKpTags: 0,
      prebuiltPaperSlots: 0,
      paperQuestionSlots: 0,
      importBatches: 0,
      questions: 0,
    };
  }

  const filenames = [...new Set([...deleteHashes])];
  void filenames;

  if (!apply) {
    const counts = await pool.query(
      `
        select
          (select count(*)::int from question_reviews where question_id = any($1::uuid[])) as question_reviews,
          (select count(*)::int from question_exam_types where question_id = any($1::uuid[])) as question_exam_types,
          (select count(*)::int from question_kp_tags where question_id = any($1::uuid[])) as question_kp_tags,
          (select count(*)::int from prebuilt_paper_slots where question_id = any($1::uuid[])) as prebuilt_paper_slots,
          (select count(*)::int from paper_question_slots where current_question_id = any($1::uuid[])) as paper_question_slots
      `,
      [ids],
    );
    return {
      matchedQuestions: ids.length,
      questionReviews: counts.rows[0].question_reviews,
      questionExamTypes: counts.rows[0].question_exam_types,
      questionKpTags: counts.rows[0].question_kp_tags,
      prebuiltPaperSlots: counts.rows[0].prebuilt_paper_slots,
      paperQuestionSlots: counts.rows[0].paper_question_slots,
      importBatches: 0,
      questions: ids.length,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const counts = {
      matchedQuestions: ids.length,
      questionReviews: Number(
        (await client.query("delete from question_reviews where question_id = any($1::uuid[])", [ids]))
          .rowCount ?? 0,
      ),
      questionExamTypes: Number(
        (
          await client.query("delete from question_exam_types where question_id = any($1::uuid[])", [
            ids,
          ])
        ).rowCount ?? 0,
      ),
      questionKpTags: Number(
        (await client.query("delete from question_kp_tags where question_id = any($1::uuid[])", [ids]))
          .rowCount ?? 0,
      ),
      prebuiltPaperSlots: Number(
        (
          await client.query("delete from prebuilt_paper_slots where question_id = any($1::uuid[])", [
            ids,
          ])
        ).rowCount ?? 0,
      ),
      paperQuestionSlots: Number(
        (
          await client.query(
            "delete from paper_question_slots where current_question_id = any($1::uuid[])",
            [ids],
          )
        ).rowCount ?? 0,
      ),
      importBatches: 0,
      questions: Number(
        (await client.query("delete from questions where id = any($1::uuid[])", [ids])).rowCount ??
          0,
      ),
    };
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function deleteSourceBundles(deletePaths, apply) {
  const workspace = path.resolve(process.cwd());
  const sourceRoot = path.resolve(process.cwd(), SOURCE_ROOT);
  const stats = {
    candidateFiles: deletePaths.size,
    deletedFiles: 0,
    missingFiles: 0,
    refusedFiles: [],
    removedEmptyDirs: 0,
  };

  for (const bundlePath of [...deletePaths].sort((left, right) => left.localeCompare(right))) {
    const abs = path.resolve(process.cwd(), bundlePath);
    const insideWorkspace = abs.startsWith(`${workspace}${path.sep}`);
    const insideSourceRoot = abs.startsWith(`${sourceRoot}${path.sep}`);
    if (!insideWorkspace || !insideSourceRoot) {
      stats.refusedFiles.push(bundlePath);
      continue;
    }
    if (!fs.existsSync(abs)) {
      stats.missingFiles += 1;
      continue;
    }
    if (apply) {
      fs.rmSync(abs);
      let current = path.dirname(abs);
      for (let depth = 0; depth < 3; depth += 1) {
        if (current === sourceRoot || !current.startsWith(`${sourceRoot}${path.sep}`)) break;
        try {
          fs.rmdirSync(current);
          stats.removedEmptyDirs += 1;
          current = path.dirname(current);
        } catch {
          break;
        }
      }
    }
    stats.deletedFiles += 1;
  }

  return stats;
}

async function queryTargetStats() {
  const rows = await pool.query(
    `
      with review_flags as (
        select
          question_id,
          bool_or(review_status in ('ai_reviewed', 'confirmed')) as has_pass_review,
          bool_or(review_status = 'rejected') as has_rejected_review
        from question_reviews
        group by question_id
      )
      select
        qet.exam_type,
        q.status,
        coalesce(rf.has_pass_review, false) as has_pass_review,
        coalesce(rf.has_rejected_review, false) as has_rejected_review,
        count(distinct q.id)::int as questions
      from questions q
      join question_exam_types qet on qet.question_id = q.id
      left join review_flags rf on rf.question_id = q.id
      where q.source <> 'real_paper'
        and qet.exam_type = any($1::text[])
      group by qet.exam_type, q.status, has_pass_review, has_rejected_review
      order by qet.exam_type, q.status, has_pass_review desc, has_rejected_review desc
    `,
    [[...TARGET_EXAMS]],
  );

  const byExam = {};
  for (const exam of TARGET_EXAMS) {
    byExam[exam] = {
      total: 0,
      reviewedOrPublishedWithPassReview: 0,
      archived: 0,
      rejectedReview: 0,
      withoutPassReview: 0,
      deficitTo2000: 2000,
      rows: [],
    };
  }

  for (const row of rows.rows) {
    const bucket = byExam[row.exam_type];
    bucket.rows.push(row);
    bucket.total += row.questions;
    if ((row.status === "reviewed" || row.status === "published") && row.has_pass_review) {
      bucket.reviewedOrPublishedWithPassReview += row.questions;
    }
    if (row.status === "archived") bucket.archived += row.questions;
    if (row.has_rejected_review) bucket.rejectedReview += row.questions;
    if (!row.has_pass_review) bucket.withoutPassReview += row.questions;
  }
  for (const bucket of Object.values(byExam)) {
    bucket.deficitTo2000 = Math.max(2000 - bucket.reviewedOrPublishedWithPassReview, 0);
  }

  return byExam;
}

async function writeSummary(summary) {
  const outDir = path.join(AUDIT_DIR, "cleanup-obsolete-question-bank");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "summary.json");
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  return repoPath(outPath);
}

async function main() {
  const apply = hasFlag("--apply");
  const write = hasFlag("--write");
  const scrubReferences = hasFlag("--scrub-report-references");
  let paths = collectReportPaths();
  const reportReferenceScrub = scrubReferences
    ? scrubReportReferences(buildObsoleteReferencePaths(paths), apply)
    : undefined;
  if (scrubReferences && apply && reportReferenceScrub?.changedFiles > 0) {
    paths = collectReportPaths();
  }
  const deleteContentHashes = collectContentHashes(paths.deletePaths);
  const approvedContentHashes = collectContentHashes(paths.keepPaths);

  const beforeStats = await queryTargetStats();
  const dbDeletePlan = await deleteDbReferences(deleteContentHashes, false);
  const importStats = await importApprovedBundles(paths.keepPaths, deleteContentHashes, apply);
  const promoteStats = await promoteApprovedQuestions(approvedContentHashes, apply);
  const dbDeleteStats = apply
    ? await deleteDbReferences(deleteContentHashes, true)
    : dbDeletePlan;
  const sourceDeleteStats = deleteSourceBundles(paths.deletePaths, apply);
  const afterStats = await queryTargetStats();

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "applied" : "dry-run",
    sourceRoot: SOURCE_ROOT,
    reportRoot: REPORT_ROOT,
    targetExams: [...TARGET_EXAMS],
    collection: {
      passedBundlePaths: paths.passedPaths.size,
      failedBundlePaths: paths.failedPaths.size,
      supersededBundlePaths: paths.supersededPaths.size,
      keepBundlePaths: paths.keepPaths.size,
      deleteBundlePaths: paths.deletePaths.size,
      approvedContentHashes: approvedContentHashes.size,
      deleteContentHashes: deleteContentHashes.size,
    },
    importStats,
    promoteStats,
    dbDeletePlan,
    dbDeleteStats,
    sourceDeleteStats,
    ...(reportReferenceScrub ? { reportReferenceScrub } : {}),
    beforeStats,
    afterStats,
  };

  if (write || apply) {
    summary.summaryPath = await writeSummary(summary);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
