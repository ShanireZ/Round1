import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type LLMScene, getSceneProviderOrder } from "../../../config/llm.js";
import {
  listPaperFiles,
  loadPaper,
  savePaper,
  type PaperData,
  type PaperQuestion,
} from "../../lib/paperFiles.js";
import { callScriptLlmScene } from "../../lib/scriptLlmClient.js";
import {
  ScriptSceneContinuationError,
  callScriptSceneWithContinuation,
} from "../../lib/scriptConversation.js";
import { buildReviewContinuationPrompt } from "../../lib/continuationPrompts.js";
import { extractJsonObject } from "../../lib/modelJson.js";
import {
  applyReviewedQuestion,
  evaluateReviewedChunk,
  reviewedChunkSchema,
  type ReviewedChunkEvaluation,
} from "../../lib/paperReview.js";
import {
  formatLeafKnowledgePointCatalog,
  loadLeafKnowledgePointCodes,
} from "../../lib/taxonomyCatalog.js";
import { createPaperAuditFilter, matchesPaperAuditFilter } from "../audit/auditRealPapers.js";

type ArgValue = string | boolean | string[];

const REVIEW_SYSTEM_PROMPT = [
  "你是信息学竞赛真题库的严谨审校员。",
  "你只能输出合法 JSON。",
  "你要逐题复核 questionType、difficulty、primaryKpCode、auxiliaryKpCodes 与 explanation。",
  "只能从提供的知识点代码清单里选择 primaryKpCode 与 auxiliaryKpCodes，优先选择叶子代码。",
  "如果题面疑似缺失、被截断、与选项不一致，stemStatus 必须输出 manual_check。",
  "如果代码缺失、被截断、与题意不一致，codeStatus 必须输出 manual_check。",
  "如果你对题型判断没有高把握，不要强改 questionType，而是保留当前值并降低 confidence。",
  "explanation 必须写成中文推导式解析，不要模板句，不要只写答案。",
  "单选题至少说明正确项为何成立，必要时说明最易错干扰项。",
  "阅读程序题要体现执行流程、状态变化、边界条件或复杂度来源。",
  "完善程序题要说明空位在整体算法中的作用。",
].join("\n");

const knowledgePointCatalogText = formatLeafKnowledgePointCatalog();
const validKnowledgePointCodes = loadLeafKnowledgePointCodes();

function parseArgs(argv: string[]) {
  const args: Record<string, ArgValue> = { _: [] };

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      (args._ as string[]).push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index++;
  }

  return args;
}

function buildQuestionPayload(question: PaperQuestion, index: number) {
  const base = {
    index,
    currentQuestionType: question.questionType,
    currentDifficulty: question.difficulty ?? "",
    currentPrimaryKpCode: question.primaryKpCode ?? "",
    currentAuxiliaryKpCodes: question.auxiliaryKpCodes ?? [],
    stem: question.stem,
  };

  if (question.questionType === "single_choice") {
    return {
      ...base,
      options: question.options ?? [],
      answer: question.answer ?? "",
      currentExplanation: question.explanation ?? "",
    };
  }

  if (question.questionType === "reading_program") {
    return {
      ...base,
      cppCode: question.cppCode ?? "",
      subQuestions: (question.subQuestions ?? []).map((entry, subIndex) => ({
        index: subIndex + 1,
        stem: entry.stem,
        options: entry.options ?? [],
        answer: entry.answer ?? "",
        currentExplanation: entry.explanation ?? "",
      })),
      answer: question.answer ?? "",
      currentExplanation: question.explanation ?? "",
    };
  }

  return {
    ...base,
    fullCode: question.fullCode ?? "",
    blanks: (question.blanks ?? []).map((entry, blankIndex) => ({
      index: blankIndex + 1,
      id: entry.id,
      options: entry.options ?? [],
      answer: entry.answer ?? "",
      currentExplanation: entry.explanation ?? "",
    })),
    answer: question.answer ?? "",
    currentExplanation: question.explanation ?? "",
  };
}

function buildReviewPrompt(
  _paper: PaperData,
  questions: PaperQuestion[],
  startIndex: number,
  metadataOnly: boolean,
): string {
  const payload = {
    knowledgePointCatalog: knowledgePointCatalogText,
    questions: questions.map((question, offset) =>
      buildQuestionPayload(question, startIndex + offset + 1),
    ),
  };

  return [
    "任务：逐题复核 metadata 和 explanation。",
    '输出格式：{"questions":[...]}。顺序必须与输入一致。',
    "每题必须输出：questionType、difficulty、primaryKpCode、auxiliaryKpCodes、confidence、stemStatus、codeStatus。",
    metadataOnly
      ? "本轮为 metadata-only：不要重写 explanation，可以省略 explanation、subExplanations、blankExplanations。"
      : "single_choice 输出 explanation。",
    metadataOnly
      ? "本轮为 metadata-only：只复核 questionType、difficulty、primaryKpCode、auxiliaryKpCodes 与风险状态。"
      : "reading_program 若有 subQuestions，则输出 subExplanations；否则输出 explanation。",
    metadataOnly
      ? "metadata-only 模式下请保持 explanation 不变。"
      : "completion_program 若有 blanks，则输出 blankExplanations；否则输出 explanation。",
    "如果发现题面或代码疑似有问题，不要擅自补写 stem 或 code，而是将对应状态置为 manual_check。",
    "不要回显输入字段以外的无关文本，也不要输出 Markdown。",
    "输入：",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseReviewedChunk(rawText: string): z.infer<typeof reviewedChunkSchema> {
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText);
  return reviewedChunkSchema.parse(parsed);
}

function writeDebugOutput(fileLabel: string, startIndex: number, rawText: string): string {
  const safeLabel = fileLabel.replace(/[\\/:]/g, "_");
  const debugPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    `${safeLabel}-review-q${startIndex + 1}.txt`,
  );
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.writeFileSync(debugPath, rawText, "utf-8");
  return debugPath;
}

function countQuestionSlots(question: PaperQuestion): number {
  if (question.questionType === "single_choice") {
    return 1;
  }

  if (question.questionType === "reading_program") {
    return Math.max(1, question.subQuestions?.length ?? 0);
  }

  return Math.max(1, question.blanks?.length ?? 0);
}

function estimateChunkMaxTokens(chunk: PaperQuestion[]): number {
  const slotCount = chunk.reduce((sum, question) => sum + countQuestionSlots(question), 0);
  return Math.min(6200, 900 + slotCount * 520);
}

function summarizeReviewCorrections(evaluated: ReviewedChunkEvaluation): string {
  return [
    ...evaluated.skipped.map((entry) => `Q${entry.questionIndex} skipped: ${entry.reason}`),
    ...evaluated.warnings.map((entry) => `Q${entry.questionIndex} warning: ${entry.reason}`),
  ].join(" | ");
}

function applyReviewedChunk(params: {
  paper: PaperData;
  evaluated: ReviewedChunkEvaluation;
  metadataOnly: boolean;
}) {
  params.evaluated.applied.forEach((entry) => {
    const question = params.paper.questions[entry.questionIndex - 1];
    if (!question) {
      throw new Error(`Question not found at index ${entry.questionIndex}`);
    }
    applyReviewedQuestion(question, entry.reviewed, { metadataOnly: params.metadataOnly });
  });

  return params.evaluated;
}

async function reviewPaper(params: {
  paper: PaperData;
  filePath: string;
  fileLabel: string;
  scene: LLMScene;
  modelOverride?: string;
  attemptTimeoutMs: number;
  chunkSize: number;
  dryRun: boolean;
  metadataOnly: boolean;
  allowStatusWarningsInMetadata: boolean;
  startQuestion: number;
  endQuestion?: number;
  reportItems: Array<Record<string, unknown>>;
}) {
  const providerOrder = getSceneProviderOrder(params.scene);
  const providerSummary = providerOrder
    .map((entry) => `${entry.providerName}:${params.modelOverride ?? entry.model}`)
    .join(" -> ");
  const totalQuestions = params.paper.questions.length;
  const firstIndex = Math.max(0, params.startQuestion - 1);
  const lastIndexExclusive =
    typeof params.endQuestion === "number"
      ? Math.min(totalQuestions, params.endQuestion)
      : totalQuestions;
  let appliedCount = 0;
  let skippedCount = 0;
  let warningCount = 0;

  console.log(
    `REVIEW-START ${params.fileLabel}: questions=${totalQuestions} providers=${providerSummary}`,
  );

  for (
    let startIndex = firstIndex;
    startIndex < lastIndexExclusive;
    startIndex += params.chunkSize
  ) {
    const chunk = params.paper.questions.slice(
      startIndex,
      Math.min(lastIndexExclusive, startIndex + params.chunkSize),
    );
    if (chunk.length === 0) {
      continue;
    }

    const chunkEndExclusive = Math.min(startIndex + chunk.length, lastIndexExclusive);
    const prompt = buildReviewPrompt(params.paper, chunk, startIndex, params.metadataOnly);
    const maxTokens = estimateChunkMaxTokens(chunk);

    console.log(`REVIEW-TRY ${params.fileLabel}: questions=${startIndex + 1}-${chunkEndExclusive}`);

    let reviewed: z.infer<typeof reviewedChunkSchema>;
    let result;
    let evaluated: ReviewedChunkEvaluation | undefined;
    try {
      const continuation = await callScriptSceneWithContinuation({
        initialPrompt: prompt,
        maxContinuationTurns: 1,
        call: ({ prompt: currentPrompt, messages }) =>
          callScriptLlmScene({
            scene: params.scene,
            modelOverride: params.modelOverride,
            system: REVIEW_SYSTEM_PROMPT,
            prompt: currentPrompt,
            messages,
            maxTokens,
            timeoutMs: params.attemptTimeoutMs,
          }),
        parse: (text) => {
          const parsed = parseReviewedChunk(text);
          const currentEvaluation = evaluateReviewedChunk({
            startIndex,
            chunk,
            reviewed: parsed,
            validKnowledgePointCodes,
            metadataOnly: params.metadataOnly,
            allowStatusWarningsInMetadata: params.allowStatusWarningsInMetadata,
          });

          if (currentEvaluation.skipped.length > 0 || currentEvaluation.warnings.length > 0) {
            throw new Error(
              `review requires correction: ${summarizeReviewCorrections(currentEvaluation)}`,
            );
          }

          evaluated = currentEvaluation;
          return parsed;
        },
        buildContinuationPrompt: ({ error }) =>
          buildReviewContinuationPrompt(error, { metadataOnly: params.metadataOnly }),
      });
      reviewed = continuation.parsed;
      result = continuation.result;
    } catch (error) {
      if (error instanceof ScriptSceneContinuationError) {
        const debugPath = writeDebugOutput(params.fileLabel, startIndex, error.result.text);
        throw new Error(`parse failed: ${error.message}. Raw output saved to ${debugPath}`);
      }

      throw error;
    }

    const { applied, skipped, warnings } = applyReviewedChunk({
      paper: params.paper,
      evaluated:
        evaluated ??
        evaluateReviewedChunk({
          startIndex,
          chunk,
          reviewed,
          validKnowledgePointCodes,
          metadataOnly: params.metadataOnly,
          allowStatusWarningsInMetadata: params.allowStatusWarningsInMetadata,
        }),
      metadataOnly: params.metadataOnly,
    });

    appliedCount += applied.length;
    skippedCount += skipped.length;
    warningCount += warnings.length;
    skipped.forEach((entry) => {
      params.reportItems.push({
        file: params.fileLabel,
        question: entry.questionIndex,
        kind: "skipped",
        reason: entry.reason,
      });
    });
    warnings.forEach((entry) => {
      params.reportItems.push({
        file: params.fileLabel,
        question: entry.questionIndex,
        kind: "warning",
        reason: entry.reason,
      });
    });

    if (!params.dryRun && applied.length > 0) {
      savePaper(params.filePath, params.paper);
    }

    console.log(
      `REVIEW-CHUNK ${params.fileLabel}: questions=${startIndex + 1}-${chunkEndExclusive} provider=${result.providerName} model=${result.model} applied=${applied.length} skipped=${skipped.length} warnings=${warnings.length} inputTokens=${result.inputTokens} outputTokens=${result.outputTokens}`,
    );
  }

  console.log(
    `REVIEW-DONE ${params.fileLabel}: applied=${appliedCount} skipped=${skippedCount} warnings=${warningCount} write=${!params.dryRun}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filter = createPaperAuditFilter(args);
  const dryRun = args.write !== true;
  const scene = typeof args.scene === "string" ? args.scene.trim() : "paper_audit";
  const attemptTimeoutMs =
    typeof args.timeout === "string" ? Number.parseInt(args.timeout, 10) : 60_000;
  const modelOverride = typeof args.model === "string" ? args.model : undefined;
  const fileFilters =
    typeof args.file === "string"
      ? args.file
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)
      : undefined;
  const chunkSize =
    typeof args["chunk-size"] === "string" ? Number.parseInt(args["chunk-size"], 10) : 2;
  const metadataOnly = args["metadata-only"] === true;
  const allowStatusWarningsInMetadata = args["metadata-allow-status-warnings"] === true;
  const limit = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : undefined;
  const startQuestion =
    typeof args["start-q"] === "string" ? Number.parseInt(args["start-q"], 10) : 1;
  const endQuestion =
    typeof args["end-q"] === "string" ? Number.parseInt(args["end-q"], 10) : undefined;
  const reportItems: Array<Record<string, unknown>> = [];

  if (!scene) {
    throw new Error("Invalid scene: <empty>");
  }

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`Invalid chunk size: ${args["chunk-size"]}`);
  }

  if (!Number.isInteger(attemptTimeoutMs) || attemptTimeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${args.timeout}`);
  }

  if (!Number.isInteger(startQuestion) || startQuestion <= 0) {
    throw new Error(`Invalid start-q: ${args["start-q"]}`);
  }

  if (
    typeof endQuestion === "number" &&
    (!Number.isInteger(endQuestion) || endQuestion < startQuestion)
  ) {
    throw new Error(`Invalid end-q: ${args["end-q"]}`);
  }

  const files = listPaperFiles();
  let reviewedPapers = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    const fileKey = `${info.outDir}/${info.fileName}`.toLowerCase();
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    if (
      fileFilters &&
      !fileFilters.some((entry) => entry === fileKey || entry === info.fileName.toLowerCase())
    ) {
      continue;
    }

    const fileLabel = `${info.outDir}/${info.fileName}`;
    try {
      await reviewPaper({
        paper,
        filePath: info.filePath,
        fileLabel,
        scene,
        modelOverride,
        attemptTimeoutMs,
        chunkSize,
        dryRun,
        metadataOnly,
        allowStatusWarningsInMetadata,
        startQuestion,
        endQuestion,
        reportItems,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportItems.push({
        file: fileLabel,
        kind: "error",
        reason: message,
      });
      console.error(`REVIEW-ERROR ${fileLabel}: ${message}`);
      continue;
    }

    reviewedPapers++;
    if (typeof limit === "number" && reviewedPapers >= limit) {
      break;
    }
  }

  const reportPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    `paper-review-report-${Date.now()}.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(reportItems, null, 2) + "\n", "utf-8");
  console.log(`REVIEW-SUMMARY papers=${reviewedPapers} write=${!dryRun} report=${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
