#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const REAL_PAPER_TAG = "\u771f\u9898";
const skippedUnknownSecondaryKps = [];

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readEnv(startDir) {
  let current = startDir;
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      const env = {};
      for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex < 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
      return { ...process.env, ...env };
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.env;
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function repoPath(cwd, filePath) {
  return path.relative(cwd, filePath).replaceAll(path.sep, "/");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function fileChecksum(filePath) {
  return sha256(fs.readFileSync(filePath, "utf8"));
}

function computeContentHash(stem, codeOrOptions) {
  const normalized = `${stem}${codeOrOptions}`
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, "");
  return sha256(normalized);
}

function summarizeQuestionBundleItem(item) {
  if (item.type === "single_choice") return item.contentJson.options.join("\n");
  if (item.type === "reading_program") return item.contentJson.cppCode;
  return item.contentJson.fullCode;
}

function summarizeRealPaperQuestion(question) {
  if (Array.isArray(question.options) && question.options.length > 0) {
    return question.options.join("");
  }
  return question.cppCode ?? question.fullCode ?? "";
}

function buildAnswerJson(question) {
  if (question.questionType === "single_choice") return { answer: question.answer };
  if (question.questionType === "reading_program") {
    return { subAnswers: (question.subQuestions ?? []).map((entry) => entry.answer) };
  }
  return {
    blanks: (question.blanks ?? []).map((entry) => ({ id: entry.id, answer: entry.answer })),
  };
}

function buildExplanationJson(question) {
  if (question.questionType === "single_choice") {
    return { explanation: question.explanation ?? "" };
  }
  if (question.questionType === "reading_program") {
    return {
      subExplanations: (question.subQuestions ?? []).map((entry) => entry.explanation ?? ""),
    };
  }
  return {
    blankExplanations: (question.blanks ?? []).map((entry) => ({
      id: entry.id,
      explanation: entry.explanation ?? "",
    })),
  };
}

function buildRealPaperContentJson(parsed, question, sourceFile) {
  const sourceValue = String(parsed.source ?? "").trim();
  const sourceIsUrl = /^https?:\/\//i.test(sourceValue);
  return {
    ...question,
    sourceType: "real_paper",
    sourceExamType: parsed.examType,
    sourceYear: parsed.year,
    sourceFile,
    sourceLabel: sourceIsUrl ? null : sourceValue,
    sourceUrl: sourceIsUrl ? sourceValue : null,
    tags: [REAL_PAPER_TAG, String(parsed.year), parsed.examType],
  };
}

function pickPaperDifficulty(questions) {
  const difficulties = new Set(questions.map((question) => question.difficulty));
  if (difficulties.has("hard")) return "hard";
  if (difficulties.has("medium")) return "medium";
  return "easy";
}

function pointsForQuestionType(questionType) {
  if (questionType === "single_choice") return 2;
  if (questionType === "reading_program") return 8;
  return 3;
}

function realPaperWhereSql(alias = "prebuilt_papers") {
  return `(
    ${alias}.metadata_json->>'paperKind' = 'real_paper'
    OR ${alias}.metadata_json->>'sourceType' = 'real_paper'
    OR ${alias}.metadata_json->>'source' = 'real_paper'
    OR (${alias}.metadata_json->'tags') ? $1
  )`;
}

function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch path outside ${resolvedRoot}: ${resolvedTarget}`);
  }
}

function removeEmptyDirs(root, dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) removed += removeEmptyDirs(root, entryPath);
  }
  if (path.resolve(dir) !== path.resolve(root) && fs.readdirSync(dir).length === 0) {
    assertInside(root, dir);
    fs.rmdirSync(dir);
    removed += 1;
  }
  return removed;
}

async function loadKnowledgePoints(client) {
  const rows = await client.query("select id, code from knowledge_points");
  return new Map(rows.rows.map((row) => [row.code, row.id]));
}

function requireKp(kpByCode, code, context) {
  const id = kpByCode.get(code);
  if (!id) throw new Error(`Unknown knowledge point ${code} in ${context}`);
  return id;
}

async function loadQuestionHashMap(client) {
  const rows = await client.query("select id, content_hash, source, status from questions");
  return new Map(
    rows.rows.map((row) => [
      row.content_hash,
      { id: row.id, source: row.source, status: row.status },
    ]),
  );
}

async function ensureQuestionTags(client, questionId, examTypes, kpCodes, kpByCode, context) {
  for (const examType of examTypes) {
    await client.query(
      `insert into question_exam_types (question_id, exam_type)
       values ($1, $2)
       on conflict do nothing`,
      [questionId, examType],
    );
  }

  for (const [index, kpCode] of kpCodes.entries()) {
    const kpId = kpByCode.get(kpCode);
    if (!kpId) {
      if (index === 0) throw new Error(`Unknown knowledge point ${kpCode} in ${context}`);
      skippedUnknownSecondaryKps.push({ code: kpCode, context });
      continue;
    }
    await client.query(
      `insert into question_kp_tags (question_id, kp_id, tag_role)
       values ($1, $2, $3)
       on conflict do nothing`,
      [questionId, kpId, index === 0 ? "primary" : "secondary"],
    );
  }
}

async function insertQuestionBundleItem(client, item, kpByCode, context) {
  const primaryKpId = requireKp(kpByCode, item.primaryKpCode, context);
  const inserted = await client.query(
    `insert into questions
      (type, difficulty, primary_kp_id, content_json, answer_json, explanation_json,
       content_hash, status, sandbox_verified, source)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, 'draft', $8, $9)
     returning id`,
    [
      item.type,
      item.difficulty,
      primaryKpId,
      JSON.stringify(item.contentJson),
      JSON.stringify(item.answerJson),
      JSON.stringify(item.explanationJson),
      item.contentHash,
      item.sandboxVerified === true,
      item.source ?? "ai",
    ],
  );
  const questionId = inserted.rows[0].id;
  await ensureQuestionTags(
    client,
    questionId,
    item.examTypes,
    [item.primaryKpCode, ...(item.auxiliaryKpCodes ?? [])],
    kpByCode,
    context,
  );
  return questionId;
}

async function reconcilePapers2026(client, cwd, kpByCode, apply) {
  const files = listJsonFiles(path.join(cwd, "papers", "2026"))
    .map((filePath) => {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return parsed?.meta?.bundleType === "question_bundle" ? { filePath, parsed } : null;
    })
    .filter(Boolean);

  const existingHashes = await loadQuestionHashMap(client);
  const appliedBatchRows = await client.query(
    "select source_filename from import_batches where bundle_type='question_bundle' and status='applied'",
  );
  const appliedBatchFilenames = new Set(appliedBatchRows.rows.map((row) => row.source_filename));

  const duplicateGroups = new Map();
  let totalItems = 0;
  let contentHashMismatches = 0;
  for (const { filePath, parsed } of files) {
    for (const [index, item] of parsed.items.entries()) {
      totalItems += 1;
      const expected = computeContentHash(item.contentJson.stem, summarizeQuestionBundleItem(item));
      if (expected !== item.contentHash) contentHashMismatches += 1;
      const entries = duplicateGroups.get(item.contentHash) ?? [];
      entries.push({ file: repoPath(cwd, filePath), index });
      duplicateGroups.set(item.contentHash, entries);
    }
  }
  const duplicateContentHashGroups = [...duplicateGroups.values()].filter(
    (entries) => entries.length > 1,
  );

  const summary = {
    questionBundleFiles: files.length,
    questionItems: totalItems,
    uniqueContentHashes: duplicateGroups.size,
    duplicateContentHashGroups: duplicateContentHashGroups.length,
    duplicateExtraItems: duplicateContentHashGroups.reduce(
      (sum, entries) => sum + entries.length - 1,
      0,
    ),
    contentHashMismatches,
    insertedQuestions: 0,
    representedExistingItems: 0,
    appliedBatchesCreated: 0,
    appliedBatchesExisting: 0,
  };

  if (!apply) {
    let represented = 0;
    for (const entries of duplicateGroups.entries()) {
      if (existingHashes.has(entries[0])) represented += entries[1].length;
    }
    summary.representedItemsBeforeApply = represented;
    return summary;
  }

  for (const { filePath, parsed } of files) {
    const sourceFilename = path.basename(filePath);
    let insertedForFile = 0;
    let representedForFile = 0;

    for (const [index, item] of parsed.items.entries()) {
      const context = `${repoPath(cwd, filePath)}#${index}`;
      const existing = existingHashes.get(item.contentHash);
      if (existing) {
        representedForFile += 1;
        await ensureQuestionTags(
          client,
          existing.id,
          item.examTypes,
          [item.primaryKpCode, ...(item.auxiliaryKpCodes ?? [])],
          kpByCode,
          context,
        );
        continue;
      }

      const questionId = await insertQuestionBundleItem(client, item, kpByCode, context);
      existingHashes.set(item.contentHash, {
        id: questionId,
        source: item.source ?? "ai",
        status: "draft",
      });
      insertedForFile += 1;
      representedForFile += 1;
    }

    summary.insertedQuestions += insertedForFile;
    summary.representedExistingItems += representedForFile - insertedForFile;

    if (appliedBatchFilenames.has(sourceFilename)) {
      summary.appliedBatchesExisting += 1;
      continue;
    }

    await client.query(
      `insert into import_batches
        (bundle_type, source_filename, checksum, status, summary_json)
       values ('question_bundle', $1, $2, 'applied', $3::jsonb)`,
      [
        sourceFilename,
        fileChecksum(filePath),
        JSON.stringify({
          totalCount: parsed.items.length,
          importedCount: parsed.items.length,
          rejectedCount: 0,
          errors: [],
          reconciliation: true,
          sourcePath: repoPath(cwd, filePath),
          insertedCount: insertedForFile,
          representedExistingCount: representedForFile - insertedForFile,
        }),
      ],
    );
    appliedBatchFilenames.add(sourceFilename);
    summary.appliedBatchesCreated += 1;
  }

  return summary;
}

async function cleanupSimulatedPrebuilt(client, cwd, apply) {
  const realPredicate = realPaperWhereSql("pp");
  const rows = await client.query(
    `select pp.id, pp.title, pp.status, pp.source_batch_id,
       (select count(*)::int from papers p where p.prebuilt_paper_id = pp.id) as paper_refs,
       (select count(*)::int from assignments a where a.prebuilt_paper_id = pp.id) as assignment_refs
     from prebuilt_papers pp
     where not ${realPredicate}`,
    [REAL_PAPER_TAG],
  );
  const deletable = rows.rows.filter((row) => row.paper_refs === 0 && row.assignment_refs === 0);
  const blocked = rows.rows.filter((row) => row.paper_refs > 0 || row.assignment_refs > 0);

  const artifactRoots = [
    path.join(cwd, "artifacts", "prebuilt-papers"),
    path.join(cwd, "papers", "2026"),
  ];
  const artifactFiles = [];
  for (const root of artifactRoots) {
    for (const filePath of listJsonFiles(root)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed?.meta?.bundleType === "prebuilt_paper_bundle") {
          artifactFiles.push({ root, filePath });
        }
      } catch {
        // Ignore non-bundle JSON.
      }
    }
  }

  const summary = {
    dbRowsFound: rows.rows.length,
    dbRowsDeleted: 0,
    dbRowsBlocked: blocked.length,
    blocked,
    importBatchesDeleted: 0,
    artifactFilesFound: artifactFiles.length,
    artifactFilesDeleted: 0,
    emptyDirsRemoved: 0,
  };

  if (!apply) return summary;

  if (deletable.length > 0) {
    const ids = deletable.map((row) => row.id);
    await client.query("delete from prebuilt_paper_slots where prebuilt_paper_id = any($1::uuid[])", [
      ids,
    ]);
    await client.query("delete from prebuilt_papers where id = any($1::uuid[])", [ids]);
    summary.dbRowsDeleted = ids.length;
  }

  const deletedBatches = await client.query(
    `delete from import_batches ib
     where ib.bundle_type = 'prebuilt_paper_bundle'
       and not exists (
         select 1 from prebuilt_papers pp where pp.source_batch_id = ib.id
       )`,
  );
  summary.importBatchesDeleted = deletedBatches.rowCount ?? 0;

  for (const { root, filePath } of artifactFiles) {
    assertInside(root, filePath);
    fs.unlinkSync(filePath);
    summary.artifactFilesDeleted += 1;
  }
  for (const root of artifactRoots) {
    summary.emptyDirsRemoved += removeEmptyDirs(root, root);
  }

  return summary;
}

async function insertRealPaperQuestion(client, parsed, question, sourceFile, kpByCode, contentHash) {
  const primaryKpId = requireKp(kpByCode, question.primaryKpCode, `${sourceFile}`);
  const inserted = await client.query(
    `insert into questions
      (type, difficulty, primary_kp_id, content_json, answer_json, explanation_json,
       content_hash, status, sandbox_verified, source, published_at)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, 'published', false, 'real_paper', now())
     returning id`,
    [
      question.questionType,
      question.difficulty,
      primaryKpId,
      JSON.stringify(buildRealPaperContentJson(parsed, question, sourceFile)),
      JSON.stringify(buildAnswerJson(question)),
      JSON.stringify(buildExplanationJson(question)),
      contentHash,
    ],
  );
  const questionId = inserted.rows[0].id;
  await ensureQuestionTags(
    client,
    questionId,
    [parsed.examType],
    [question.primaryKpCode, ...(question.auxiliaryKpCodes ?? [])],
    kpByCode,
    `${sourceFile}`,
  );
  await client.query(
    `insert into question_reviews (question_id, review_status, reviewer_notes, reviewed_at)
     values ($1, 'confirmed', $2, now())`,
    [questionId, "Confirmed from historical real-paper source import"],
  );
  return questionId;
}

async function importRealPapers(client, cwd, kpByCode, apply) {
  const root = path.join(cwd, "papers", "real-papers");
  const files = listJsonFiles(root).map((filePath) => ({
    filePath,
    sourceFile: path.relative(root, filePath).replaceAll(path.sep, "/"),
    parsed: JSON.parse(fs.readFileSync(filePath, "utf8")),
  }));
  const hashMap = await loadQuestionHashMap(client);
  const existingPaperRows = await client.query(
    `select pp.id, pp.metadata_json->>'sourceFile' as source_file
     from prebuilt_papers pp
     where ${realPaperWhereSql("pp")}`,
    [REAL_PAPER_TAG],
  );
  const existingRealPapers = new Map(
    existingPaperRows.rows.map((row) => [row.source_file, row.id]),
  );

  const occurrencesByQuestionId = new Map();
  const summary = {
    filesFound: files.length,
    questionItems: 0,
    uniqueContentHashes: 0,
    duplicateExtraItems: 0,
    questionsInserted: 0,
    questionsRepresentedExisting: 0,
    prebuiltPapersCreated: 0,
    prebuiltPapersExisting: existingRealPapers.size,
    prebuiltSlotsInserted: 0,
  };
  const realHashes = new Map();

  for (const { filePath, sourceFile, parsed } of files) {
    summary.questionItems += parsed.questions.length;
    for (const [index, question] of parsed.questions.entries()) {
      const contentHash = computeContentHash(question.stem, summarizeRealPaperQuestion(question));
      const entries = realHashes.get(contentHash) ?? [];
      entries.push({ sourceFile, index });
      realHashes.set(contentHash, entries);
    }

    if (!apply) continue;

    const slots = [];
    for (const [index, question] of parsed.questions.entries()) {
      const contentHash = computeContentHash(question.stem, summarizeRealPaperQuestion(question));
      let existing = hashMap.get(contentHash);
      if (!existing) {
        const questionId = await insertRealPaperQuestion(
          client,
          parsed,
          question,
          sourceFile,
          kpByCode,
          contentHash,
        );
        existing = { id: questionId, source: "real_paper", status: "published" };
        hashMap.set(contentHash, existing);
        summary.questionsInserted += 1;
      } else {
        summary.questionsRepresentedExisting += 1;
        await ensureQuestionTags(
          client,
          existing.id,
          [parsed.examType],
          [question.primaryKpCode, ...(question.auxiliaryKpCodes ?? [])],
          kpByCode,
          `${sourceFile}#${index}`,
        );
      }

      const occurrences = occurrencesByQuestionId.get(existing.id) ?? [];
      occurrences.push({
        sourceFile,
        questionIndex: index,
        examType: parsed.examType,
        year: parsed.year,
      });
      occurrencesByQuestionId.set(existing.id, occurrences);

      slots.push({
        slotNo: index + 1,
        questionId: existing.id,
        questionType: question.questionType,
        primaryKpId: requireKp(kpByCode, question.primaryKpCode, `${sourceFile}#${index}`),
        difficulty: question.difficulty,
        points: pointsForQuestionType(question.questionType),
      });
    }

    if (existingRealPapers.has(sourceFile)) continue;

    const paperId = crypto.randomUUID();
    const sourceValue = String(parsed.source ?? "").trim();
    const sourceIsUrl = /^https?:\/\//i.test(sourceValue);
    const sourceStem = path.basename(sourceFile, ".json");
    const isSample = sourceStem.includes("sample");
    const yearLabel = isSample ? `${parsed.year} sample` : String(parsed.year);
    const tags = [REAL_PAPER_TAG, String(parsed.year), parsed.examType];
    if (isSample) tags.push("sample");

    const batch = await client.query(
      `insert into import_batches
        (bundle_type, source_filename, checksum, status, summary_json)
       values ('prebuilt_paper_bundle', $1, $2, 'applied', $3::jsonb)
       returning id`,
      [
        `real-papers/${sourceFile}`,
        fileChecksum(filePath),
        JSON.stringify({
          totalCount: 1,
          importedCount: 1,
          rejectedCount: 0,
          errors: [],
          reconciliation: true,
          paperKind: "real_paper",
          sourceFile,
          questionCount: slots.length,
        }),
      ],
    );

    await client.query(
      `insert into prebuilt_papers
        (id, title, exam_type, difficulty, blueprint_version, root_paper_id, parent_paper_id,
         version_no, status, source_batch_id, metadata_json, published_at)
       values ($1, $2, $3, $4, 1, $1, null, 1, 'published', $5, $6::jsonb, now())`,
      [
        paperId,
        `${parsed.examType} ${yearLabel} ${REAL_PAPER_TAG}\u5377`,
        parsed.examType,
        pickPaperDifficulty(parsed.questions),
        batch.rows[0].id,
        JSON.stringify({
          paperKind: "real_paper",
          sourceType: "real_paper",
          source: "real_paper",
          sourceFile,
          sourceYear: parsed.year,
          sourceExamType: parsed.examType,
          sourceLabel: sourceIsUrl ? null : sourceValue,
          sourceUrl: sourceIsUrl ? sourceValue : null,
          tags,
          questionCount: slots.length,
        }),
      ],
    );

    for (const slot of slots) {
      await client.query(
        `insert into prebuilt_paper_slots
          (prebuilt_paper_id, slot_no, question_id, question_type, primary_kp_id, difficulty, points)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          paperId,
          slot.slotNo,
          slot.questionId,
          slot.questionType,
          slot.primaryKpId,
          slot.difficulty,
          slot.points,
        ],
      );
      summary.prebuiltSlotsInserted += 1;
    }
    existingRealPapers.set(sourceFile, paperId);
    summary.prebuiltPapersCreated += 1;
  }

  summary.uniqueContentHashes = realHashes.size;
  summary.duplicateExtraItems = [...realHashes.values()].reduce(
    (sum, entries) => sum + Math.max(entries.length - 1, 0),
    0,
  );

  if (apply) {
    for (const [questionId, occurrences] of occurrencesByQuestionId.entries()) {
      await client.query(
        `update questions
         set content_json = jsonb_set(content_json, '{sourceOccurrences}', $1::jsonb, true),
             updated_at = now()
         where id = $2 and source = 'real_paper'`,
        [JSON.stringify(occurrences), questionId],
      );
    }
  }

  return summary;
}

async function auditDatabase(client) {
  const questionRows = await client.query(
    "select source, status, count(*)::int as count from questions group by source, status order by source, status",
  );
  const batchRows = await client.query(
    "select bundle_type, status, count(*)::int as count from import_batches group by bundle_type, status order by bundle_type, status",
  );
  const prebuiltRows = await client.query(
    "select status, count(*)::int as count from prebuilt_papers group by status order by status",
  );
  const refs = await client.query(`select
    (select count(*)::int from prebuilt_papers) as prebuilt_papers,
    (select count(*)::int from prebuilt_paper_slots) as prebuilt_paper_slots,
    (select count(*)::int from papers where prebuilt_paper_id is not null) as paper_refs,
    (select count(*)::int from assignments where prebuilt_paper_id is not null) as assignment_refs`);
  const realPapers = await client.query(
    `select count(*)::int as count from prebuilt_papers pp where ${realPaperWhereSql("pp")}`,
    [REAL_PAPER_TAG],
  );
  return {
    questionRowsBySourceStatus: questionRows.rows,
    importBatchesByTypeStatus: batchRows.rows,
    prebuiltPaperRowsByStatus: prebuiltRows.rows,
    prebuiltReferences: refs.rows[0],
    realPaperPrebuiltPapers: realPapers.rows[0].count,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const reportPath =
    readArg(args, "--report") ??
    path.join(
      "artifacts",
      "reports",
      "2026",
      "2026-05-02T02-05-46-784Z",
      "reconcile-offline-content-2026.json",
    );
  const cwd = process.cwd();
  const env = readEnv(cwd);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry_run",
    actions: {},
    databaseBefore: null,
    databaseAfter: null,
    warnings: {
      skippedUnknownSecondaryKps,
    },
  };

  try {
    report.databaseBefore = await auditDatabase(client);
    const kpByCode = await loadKnowledgePoints(client);

    if (apply) await client.query("begin");
    report.actions.papers2026 = await reconcilePapers2026(client, cwd, kpByCode, apply);
    report.actions.realPapers = await importRealPapers(client, cwd, kpByCode, apply);
    report.actions.prebuiltCleanup = await cleanupSimulatedPrebuilt(client, cwd, apply);
    if (apply) await client.query("commit");

    report.databaseAfter = await auditDatabase(client);
  } catch (error) {
    if (apply) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original error.
      }
    }
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  const resolvedReportPath = path.resolve(cwd, reportPath);
  fs.mkdirSync(path.dirname(resolvedReportPath), { recursive: true });
  fs.writeFileSync(resolvedReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
