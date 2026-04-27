import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import { blueprintSpecs, type BlueprintSection } from "../../config/blueprint.js";
import { db, checkDbConnection } from "../../server/db.js";
import { importBatches } from "../../server/db/schema/importBatches.js";
import { knowledgePoints } from "../../server/db/schema/knowledgePoints.js";
import { prebuiltPapers } from "../../server/db/schema/prebuiltPapers.js";
import { prebuiltPaperSlots } from "../../server/db/schema/prebuiltPaperSlots.js";
import { questionExamTypes } from "../../server/db/schema/questionExamTypes.js";
import { questions } from "../../server/db/schema/questions.js";
import {
  type ImportError,
  type ImportSummary,
  type PrebuiltPaperBundle,
  type PrebuiltPaperBundleItem,
  type PrebuiltPaperSlot,
  PrebuiltPaperBundleSchema,
  BUNDLE_SCHEMA_VERSION,
  buildImportSummary,
  computeChecksum,
  computeJsonChecksum,
  verifyBundleIntegrity,
} from "./bundleTypes.js";

export interface LoadedPrebuiltPaperBundle {
  bundle: PrebuiltPaperBundle;
  raw: string;
  checksum: string;
  sourceFilename: string;
  sourcePath: string;
}

export interface PrebuiltPaperValidationResult {
  summary: ImportSummary;
  errors: ImportError[];
  dbChecksSkipped: boolean;
}

export interface BuildPrebuiltPaperArgs {
  examType: keyof typeof blueprintSpecs;
  difficulty: "easy" | "medium" | "hard";
  count: number;
  runId: string;
  blueprintVersion?: number;
}

export interface ImportPrebuiltPaperBundleOptions {
  apply: boolean;
  persistDryRun?: boolean;
  importedBy?: string | null;
}

function getSectionSlotCount(section: BlueprintSection): number {
  return section.groupCount ?? section.questionCount;
}

function getSectionPointDistribution(section: BlueprintSection): number[] {
  const slotCount = getSectionSlotCount(section);
  const base = Math.floor(section.maxScore / slotCount);
  const remainder = section.maxScore % slotCount;

  return Array.from({ length: slotCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function computeOverlapScore(questionIds: string[], previousQuestionIds: string[][]): number {
  if (previousQuestionIds.length === 0 || questionIds.length === 0) {
    return 0;
  }

  const current = new Set(questionIds);
  const ratios = previousQuestionIds.map((previous) => {
    const previousSet = new Set(previous);
    let overlap = 0;
    for (const questionId of current) {
      if (previousSet.has(questionId)) {
        overlap += 1;
      }
    }
    return overlap / current.size;
  });

  return Number(Math.max(...ratios).toFixed(4));
}

function selectWithRotation<T extends { id: string }>(
  candidates: T[],
  count: number,
  rotation: number,
  usedIds: Set<string>,
): T[] {
  if (candidates.length < count) {
    throw new Error(`Not enough candidates: need ${count}, got ${candidates.length}`);
  }

  const selected: T[] = [];
  const offset = rotation % candidates.length;

  for (let step = 0; step < candidates.length && selected.length < count; step += 1) {
    const candidate = candidates[(offset + step) % candidates.length]!;
    if (usedIds.has(candidate.id)) {
      continue;
    }
    usedIds.add(candidate.id);
    selected.push(candidate);
  }

  if (selected.length < count) {
    throw new Error(`Unable to select ${count} unique candidates for current paper`);
  }

  return selected;
}

export async function loadPrebuiltPaperBundle(
  bundlePath: string,
): Promise<LoadedPrebuiltPaperBundle> {
  const sourcePath = path.resolve(process.cwd(), bundlePath);
  const raw = await readFile(sourcePath, "utf8");
  const parsed = PrebuiltPaperBundleSchema.parse(JSON.parse(raw));

  return {
    bundle: parsed,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename: path.basename(sourcePath),
    sourcePath,
  };
}

export async function buildPrebuiltPaperBundle(
  args: BuildPrebuiltPaperArgs,
): Promise<PrebuiltPaperBundle> {
  const spec = blueprintSpecs[args.examType];
  const blueprintVersion = args.blueprintVersion ?? 1;
  const builtAt = new Date().toISOString();
  const provider = "local-deterministic";
  const model = "prebuilt-paper-builder-v1";
  const promptHash = computeJsonChecksum({
    args,
    blueprintVersion,
    sections: spec.sections,
  });
  const sourceBatchId = `${model}:${args.examType}:${args.difficulty}:${builtAt}`;
  const quotaCodes = Array.from(
    new Set(
      spec.sections.flatMap((section) => section.primaryKpQuota.map((quota) => quota.kpCode)),
    ),
  );
  const kpRows = await db
    .select({ id: knowledgePoints.id, code: knowledgePoints.code })
    .from(knowledgePoints)
    .where(inArray(knowledgePoints.code, quotaCodes));
  const kpIdByCode = new Map(kpRows.map((row) => [row.code, row.id]));
  const previousQuestionIds: string[][] = [];
  const items: PrebuiltPaperBundleItem[] = [];
  const overlapScores: number[] = [];

  for (let paperIndex = 0; paperIndex < args.count; paperIndex += 1) {
    const usedIds = new Set<string>();
    const slots: PrebuiltPaperSlot[] = [];
    let slotNo = 1;

    for (const section of spec.sections) {
      const pointDistribution = getSectionPointDistribution(section);
      let sectionSlotIndex = 0;

      for (const quota of section.primaryKpQuota) {
        const kpId = kpIdByCode.get(quota.kpCode);
        if (!kpId) {
          throw new Error(`Missing knowledge point for quota ${quota.kpCode}`);
        }

        const candidateRows = await db
          .select({
            id: questions.id,
            questionType: questions.type,
            primaryKpId: questions.primaryKpId,
            difficulty: questions.difficulty,
          })
          .from(questions)
          .innerJoin(questionExamTypes, eq(questionExamTypes.questionId, questions.id))
          .where(
            and(
              eq(questions.status, "published"),
              eq(questions.type, section.questionType),
              eq(questions.primaryKpId, kpId),
              eq(questionExamTypes.examType, args.examType),
            ),
          );

        const selected = selectWithRotation(candidateRows, quota.count, paperIndex, usedIds);
        for (const question of selected) {
          slots.push({
            slotNo,
            questionId: question.id,
            questionType: question.questionType as PrebuiltPaperSlot["questionType"],
            primaryKpId: question.primaryKpId,
            difficulty: question.difficulty as PrebuiltPaperSlot["difficulty"],
            points: pointDistribution[sectionSlotIndex] ?? pointDistribution.at(-1) ?? 1,
          });
          slotNo += 1;
          sectionSlotIndex += 1;
        }
      }
    }

    const questionIds = slots.map((slot) => slot.questionId);
    const overlapScore = computeOverlapScore(questionIds, previousQuestionIds);
    overlapScores.push(overlapScore);
    items.push({
      title: `${args.examType} ${args.difficulty} 预制卷 ${paperIndex + 1}`,
      examType: args.examType,
      difficulty: args.difficulty,
      blueprintVersion,
      metadataJson: {
        overlapScore,
        provider,
        model,
        promptHash,
        sourceBatchId,
        sourceTimestamp: builtAt,
      },
      slots,
    });
    previousQuestionIds.push(questionIds);
  }

  return {
    meta: {
      bundleType: "prebuilt_paper_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId: args.runId,
      createdAt: builtAt,
      builtAt,
      provider,
      model,
      promptHash,
      sourceBatchId,
      sourceBatchIds: [sourceBatchId],
      sourceTimestamp: builtAt,
      examType: args.examType,
      difficulty: args.difficulty,
      requestedCount: args.count,
      blueprintVersion,
      overlapScore: overlapScores.length === 0 ? 0 : Number(Math.max(...overlapScores).toFixed(4)),
    },
    items,
  };
}

export async function validatePrebuiltPaperBundle(
  loaded: LoadedPrebuiltPaperBundle,
): Promise<PrebuiltPaperValidationResult> {
  const errors: ImportError[] = [];
  const rejectedItems = new Set<number>();
  let dbChecksSkipped = false;
  let dbAvailable = false;

  try {
    await checkDbConnection();
    dbAvailable = true;
  } catch {
    dbChecksSkipped = true;
  }

  const integrityErrors = verifyBundleIntegrity(loaded.bundle.items, loaded.bundle.meta.integrity);
  for (const error of integrityErrors) {
    errors.push(error);
    if (error.code === "INTEGRITY_MANIFEST_COUNT_MISMATCH") {
      loaded.bundle.items.forEach((_item, itemIndex) => rejectedItems.add(itemIndex));
    } else if (error.itemIndex !== undefined) {
      rejectedItems.add(error.itemIndex);
    }
  }

  for (const [index, item] of loaded.bundle.items.entries()) {
    const spec = blueprintSpecs[item.examType];
    const expectedSlotTotal = spec.sections.reduce(
      (sum, section) => sum + getSectionSlotCount(section),
      0,
    );

    if (item.examType !== loaded.bundle.meta.examType) {
      errors.push({
        code: "EXAM_TYPE_MISMATCH",
        message: `item ${index} examType does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (item.difficulty !== loaded.bundle.meta.difficulty) {
      errors.push({
        code: "DIFFICULTY_MISMATCH",
        message: `item ${index} difficulty does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (item.blueprintVersion !== loaded.bundle.meta.blueprintVersion) {
      errors.push({
        code: "BLUEPRINT_VERSION_MISMATCH",
        message: `item ${index} blueprintVersion does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (item.slots.length !== expectedSlotTotal) {
      errors.push({
        code: "SLOT_COUNT_MISMATCH",
        message: `item ${index} slot count ${item.slots.length} does not match blueprint ${expectedSlotTotal}`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    const uniqueQuestionIds = new Set(item.slots.map((slot) => slot.questionId));
    if (uniqueQuestionIds.size !== item.slots.length) {
      errors.push({
        code: "DUPLICATE_QUESTION_ID",
        message: `item ${index} contains duplicate question references`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    for (const section of spec.sections) {
      const sectionSlots = item.slots.filter((slot) => slot.questionType === section.questionType);
      const expectedSlotCount = getSectionSlotCount(section);
      const actualPoints = sectionSlots.reduce((sum, slot) => sum + slot.points, 0);

      if (sectionSlots.length !== expectedSlotCount) {
        errors.push({
          code: "SECTION_SLOT_COUNT_MISMATCH",
          message: `item ${index} section ${section.questionType} has ${sectionSlots.length} slots, expected ${expectedSlotCount}`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }

      if (actualPoints !== section.maxScore) {
        errors.push({
          code: "SECTION_POINTS_MISMATCH",
          message: `item ${index} section ${section.questionType} points ${actualPoints} != ${section.maxScore}`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }
    }

    if (!dbAvailable) {
      continue;
    }

    const questionIds = item.slots.map((slot) => slot.questionId);
    const questionRows = await db
      .select({
        id: questions.id,
        type: questions.type,
        difficulty: questions.difficulty,
        primaryKpId: questions.primaryKpId,
        status: questions.status,
      })
      .from(questions)
      .where(inArray(questions.id, questionIds));
    const examRows = await db
      .select({ questionId: questionExamTypes.questionId })
      .from(questionExamTypes)
      .where(
        and(
          inArray(questionExamTypes.questionId, questionIds),
          eq(questionExamTypes.examType, item.examType),
        ),
      );

    const questionById = new Map(questionRows.map((row) => [row.id, row]));
    const examIdSet = new Set(examRows.map((row) => row.questionId));

    for (const slot of item.slots) {
      const question = questionById.get(slot.questionId);
      if (!question) {
        errors.push({
          code: "QUESTION_NOT_FOUND",
          message: `item ${index} slot ${slot.slotNo} references missing question ${slot.questionId}`,
          itemIndex: index,
        });
        rejectedItems.add(index);
        continue;
      }

      if (question.status !== "published") {
        errors.push({
          code: "QUESTION_NOT_PUBLISHED",
          message: `item ${index} slot ${slot.slotNo} references non-published question ${slot.questionId}`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }

      if (
        question.type !== slot.questionType ||
        question.difficulty !== slot.difficulty ||
        question.primaryKpId !== slot.primaryKpId
      ) {
        errors.push({
          code: "QUESTION_SLOT_MISMATCH",
          message: `item ${index} slot ${slot.slotNo} does not match referenced question metadata`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }

      if (!examIdSet.has(slot.questionId)) {
        errors.push({
          code: "QUESTION_EXAM_TYPE_MISMATCH",
          message: `item ${index} slot ${slot.slotNo} question is not tagged for ${item.examType}`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }
    }
  }

  const summary = buildImportSummary(
    loaded.bundle.items.length,
    Math.max(loaded.bundle.items.length - rejectedItems.size, 0),
    errors,
  );

  return {
    summary,
    errors,
    dbChecksSkipped,
  };
}

export async function importPrebuiltPaperBundle(
  loaded: LoadedPrebuiltPaperBundle,
  options: ImportPrebuiltPaperBundleOptions,
) {
  const validation = await validatePrebuiltPaperBundle(loaded);

  if (validation.errors.length > 0 && options.apply) {
    throw new Error(
      `Bundle validation failed: ${validation.errors.map((error) => error.code).join(", ")}`,
    );
  }

  const summary = options.apply
    ? buildImportSummary(loaded.bundle.items.length, loaded.bundle.items.length, [])
    : validation.summary;

  if (!options.apply && options.persistDryRun === false) {
    return {
      status: "dry_run" as const,
      summary,
      persisted: false,
      dbChecksSkipped: validation.dbChecksSkipped,
    };
  }

  let dbAvailable = true;
  try {
    await checkDbConnection();
  } catch {
    dbAvailable = false;
  }

  if (!dbAvailable) {
    return {
      status: options.apply ? ("failed" as const) : ("dry_run" as const),
      summary,
      persisted: false,
      dbChecksSkipped: validation.dbChecksSkipped,
    };
  }

  if (!options.apply) {
    const [batch] = await db
      .insert(importBatches)
      .values({
        bundleType: "prebuilt_paper_bundle",
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        status: "dry_run",
        summaryJson: summary,
        importedBy: options.importedBy,
      })
      .returning({
        id: importBatches.id,
        status: importBatches.status,
      });

    return {
      ...batch,
      summary,
      persisted: true,
      dbChecksSkipped: validation.dbChecksSkipped,
    };
  }

  const batch = await db.transaction(async (tx) => {
    const [createdBatch] = await tx
      .insert(importBatches)
      .values({
        bundleType: "prebuilt_paper_bundle",
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        status: "applied",
        summaryJson: summary,
        importedBy: options.importedBy,
      })
      .returning({
        id: importBatches.id,
        status: importBatches.status,
      });

    if (!createdBatch) {
      throw new Error("prebuilt paper import batch insert failed");
    }

    for (const item of loaded.bundle.items) {
      const paperId = randomUUID();
      const [createdPaper] = await tx
        .insert(prebuiltPapers)
        .values({
          id: paperId,
          title: item.title,
          examType: item.examType,
          difficulty: item.difficulty,
          blueprintVersion: item.blueprintVersion,
          rootPaperId: paperId,
          parentPaperId: null,
          versionNo: 1,
          status: "draft",
          sourceBatchId: createdBatch.id,
          metadataJson: item.metadataJson,
        })
        .returning({ id: prebuiltPapers.id });

      if (!createdPaper) {
        throw new Error("prebuilt paper import insert failed");
      }

      await tx.insert(prebuiltPaperSlots).values(
        item.slots.map((slot) => ({
          prebuiltPaperId: createdPaper.id,
          slotNo: slot.slotNo,
          questionId: slot.questionId,
          questionType: slot.questionType,
          primaryKpId: slot.primaryKpId,
          difficulty: slot.difficulty,
          points: slot.points,
        })),
      );
    }

    return createdBatch;
  });

  return {
    ...batch,
    summary,
    persisted: true,
    dbChecksSkipped: validation.dbChecksSkipped,
  };
}
