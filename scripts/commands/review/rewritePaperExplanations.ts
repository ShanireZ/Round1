import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSceneProviderOrder, type LLMScene } from "../../../config/llm.js";
import {
  listPaperFiles,
  loadPaper,
  savePaper,
  type PaperData,
  type PaperQuestion,
} from "../../lib/paperFiles.js";
import { applyChunkRewrite, validateChunkRewrite } from "../../lib/paperRewrite.js";
import {
  collectQuestionQualityIssues,
  createPaperAuditFilter,
  matchesPaperAuditFilter,
} from "../audit/auditRealPapers.js";
import { callScriptLlmScene } from "../../lib/scriptLlmClient.js";
import {
  ScriptSceneContinuationError,
  callScriptSceneWithContinuation,
} from "../../lib/scriptConversation.js";
import {
  buildRewriteContinuationPrompt,
  type RewriteQuestionType,
} from "../../lib/continuationPrompts.js";
import { extractJsonObject } from "../../lib/modelJson.js";

type ArgValue = string | boolean | string[];

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

const REWRITE_SYSTEM_PROMPT = [
  "你是信息学竞赛题库的解析改写员。",
  "你只能输出合法 JSON。",
  "禁止回显题目原文、选项、代码或任何输入字段。",
  "每条 explanation 必须是中文推导式解析，不能是模板句。",
  "优先写成 3 到 6 句，通常控制在 120 到 220 个汉字。",
  "单选题至少说明正确项为什么成立，必要时点出最容易误选的干扰项。",
  "阅读程序题要结合程序执行过程、状态变化、边界条件或复杂度来源来解释。",
  "完善程序题要说明该空在整体算法中的作用，以及为什么其他候选不合适。",
].join("\n");

function buildChunkPrompt(
  _paper: PaperData,
  questions: PaperQuestion[],
  startIndex: number,
): string {
  const payload = {
    questions: questions.map((question, offset) => {
      const index = startIndex + offset + 1;
      if (question.questionType === "single_choice") {
        return {
          index,
          questionType: question.questionType,
          stem: question.stem,
          options: question.options ?? [],
          answer: question.answer ?? "",
        };
      }

      if (question.questionType === "reading_program") {
        return {
          index,
          questionType: question.questionType,
          hasSubQuestions: (question.subQuestions ?? []).length > 0,
          stem: question.stem,
          cppCode: question.cppCode ?? "",
          subQuestions: (question.subQuestions ?? []).map((entry, subIndex) => ({
            index: subIndex + 1,
            stem: entry.stem,
            options: entry.options ?? [],
            answer: entry.answer ?? "",
          })),
        };
      }

      return {
        index,
        questionType: question.questionType,
        stem: question.stem,
        fullCode: question.fullCode ?? "",
        blanks: (question.blanks ?? []).map((entry, blankIndex) => ({
          index: blankIndex + 1,
          id: entry.id,
          options: entry.options ?? [],
          answer: entry.answer ?? "",
        })),
      };
    }),
  };

  return [
    "任务：重写 explanation。",
    "规则：只返回 explanations JSON；顺序与输入一致；不要回显输入字段。",
    "单选题返回 explanation；有子题的阅读程序题返回 subExplanations；无子题的阅读程序题返回 explanation；完善程序题返回 blankExplanations。",
    "不要返回 questionType、index、id。",
    "解析必须交代关键推导、计算步骤、状态变化或空位作用，不能只写“因此选A/第1空选B”。",
    "单选题至少说明正确项成立的核心原因；阅读程序题要体现程序行为；完善程序题要说明该空与整体算法的关系。",
    "每条 explanation 尽量写得完整，通常控制在 120 到 220 个汉字。",
    '输出示例：{"questions":[{"explanation":"..."},{"subExplanations":["...","..."]},{"explanation":"..."},{"blankExplanations":["...","..."]}]}。',
    "输入：",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

const rewriteEntrySchema = z.object({
  explanation: z.string().optional(),
  subExplanations: z.array(z.string()).optional(),
  blankExplanations: z.array(z.string()).optional(),
});

const rewriteChunkSchema = z.object({
  questions: z.array(rewriteEntrySchema),
});

function repairJsonClosers(rawText: string): string {
  let repaired = "";
  const stack: string[] = [];
  let inString = false;
  let escaping = false;

  for (const char of rawText) {
    if (inString) {
      repaired += char;

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      repaired += char;
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      repaired += char;
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") {
      repaired += char;
      continue;
    }

    const expectedOpen = char === "}" ? "{" : "[";
    while (stack.length > 0 && stack.at(-1) !== expectedOpen) {
      const open = stack.pop();
      repaired = `${repaired}${open === "[" ? "]" : "}"}`;
    }

    repaired += char;

    if (stack.at(-1) === expectedOpen) {
      stack.pop();
    }
  }

  while (stack.length > 0) {
    const open = stack.pop();
    repaired = `${repaired}${open === "[" ? "]" : "}"}`;
  }

  return repaired.replace(/,(\s*[}\]])/g, "$1");
}

function parseRewriteChunk(rawText: string) {
  const jsonText = extractJsonObject(rawText);
  try {
    return rewriteChunkSchema.parse(JSON.parse(jsonText));
  } catch {
    const repairedJsonText = repairJsonClosers(jsonText);
    return rewriteChunkSchema.parse(JSON.parse(repairedJsonText));
  }
}

function writeDebugOutput(fileLabel: string, startIndex: number, rawText: string): string {
  const safeLabel = fileLabel.replace(/[\\/:]/g, "_");
  const debugPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    `${safeLabel}-q${startIndex + 1}.txt`,
  );
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.writeFileSync(debugPath, rawText, "utf-8");
  return debugPath;
}

function countWeakExplanations(paper: PaperData): number {
  return paper.questions.reduce(
    (sum, question) =>
      sum +
      collectQuestionQualityIssues(question).filter((issue) => issue.type === "weak_explanation")
        .length,
    0,
  );
}

function questionHasWeakExplanation(question: PaperQuestion): boolean {
  return collectQuestionQualityIssues(question).some((issue) => issue.type === "weak_explanation");
}

function hasPlaceholderStem(question: PaperQuestion): boolean {
  if (question.questionType === "reading_program" && question.subQuestions?.length) {
    return question.subQuestions.some((entry) => /^第\d+小题$/.test(entry.stem.trim()));
  }

  return false;
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
  return Math.min(5200, 500 + slotCount * 420);
}

async function rewritePaper(params: {
  paper: PaperData;
  filePath: string;
  fileLabel: string;
  scene: LLMScene;
  chunkSize: number;
  attemptTimeoutMs: number;
  modelOverride?: string;
  dryRun: boolean;
  startQuestion: number;
  endQuestion?: number;
}) {
  const providerOrder = getSceneProviderOrder(params.scene);
  const totalQuestions = params.paper.questions.length;
  const beforeWeak = countWeakExplanations(params.paper);
  const providerSummary = providerOrder
    .map((entry) => `${entry.providerName}:${params.modelOverride ?? entry.model}`)
    .join(" -> ");

  console.log(
    `REWRITE-START ${params.fileLabel}: questions=${totalQuestions} weakBefore=${beforeWeak} providers=${providerSummary}`,
  );

  const firstIndex = Math.max(0, params.startQuestion - 1);
  const lastIndexExclusive =
    typeof params.endQuestion === "number"
      ? Math.min(totalQuestions, params.endQuestion)
      : totalQuestions;

  for (
    let startIndex = firstIndex;
    startIndex < lastIndexExclusive;
    startIndex += params.chunkSize
  ) {
    const chunk = params.paper.questions.slice(startIndex, startIndex + params.chunkSize);
    if (chunk.length === 0) {
      continue;
    }

    const chunkEndExclusive = Math.min(startIndex + chunk.length, lastIndexExclusive);
    if (!chunk.some((question) => questionHasWeakExplanation(question))) {
      console.log(
        `REWRITE-SKIP ${params.fileLabel}: questions=${startIndex + 1}-${chunkEndExclusive} reason=no-weak-explanations`,
      );
      continue;
    }

    const prompt = buildChunkPrompt(params.paper, chunk, startIndex);
    const maxTokens = estimateChunkMaxTokens(chunk);

    const chunkErrors: string[] = [];
    let chunkProviderName = "";
    let chunkModelName = "";
    let chunkUsage: { inputTokens?: number; outputTokens?: number } | undefined;

    for (const providerConfig of providerOrder) {
      const modelName = params.modelOverride ?? providerConfig.model;

      try {
        console.log(
          `REWRITE-TRY ${params.fileLabel}: questions=${startIndex + 1}-${chunkEndExclusive} provider=${providerConfig.providerName} model=${modelName}`,
        );

        let rewritten: z.infer<typeof rewriteChunkSchema>;
        let result;
        try {
          const continuation = await callScriptSceneWithContinuation({
            initialPrompt: prompt,
            maxContinuationTurns: 1,
            call: ({ prompt: currentPrompt, messages }) =>
              callScriptLlmScene({
                scene: params.scene,
                lane: providerConfig.lane,
                allowBackupFallback: false,
                modelOverride: modelName,
                system: REWRITE_SYSTEM_PROMPT,
                prompt: currentPrompt,
                messages,
                maxTokens,
                timeoutMs: params.attemptTimeoutMs,
              }),
            parse: (text) => {
              const parsed = parseRewriteChunk(text);
              validateChunkRewrite({
                paper: params.paper,
                startIndex,
                chunk,
                rewritten: parsed,
              });
              return parsed;
            },
            buildContinuationPrompt: ({ error }) => {
              const questionTypes = [
                ...new Set(chunk.map((question) => question.questionType)),
              ] as RewriteQuestionType[];
              return buildRewriteContinuationPrompt(error, {
                questionTypes,
              });
            },
          });
          rewritten = continuation.parsed;
          result = continuation.result;
        } catch (error) {
          if (error instanceof ScriptSceneContinuationError) {
            const debugPath = writeDebugOutput(params.fileLabel, startIndex, error.result.text);
            throw new Error(`parse failed: ${error.message}. Raw output saved to ${debugPath}`);
          }

          throw error;
        }

        try {
          applyChunkRewrite(params.paper, startIndex, chunk, rewritten);
        } catch (error) {
          const debugPath = writeDebugOutput(
            params.fileLabel,
            startIndex,
            JSON.stringify(rewritten, null, 2),
          );
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `validated content unexpectedly failed to apply: ${message}. Parsed output saved to ${debugPath}`,
          );
        }

        if (!params.dryRun) {
          savePaper(params.filePath, params.paper);
        }

        chunkProviderName = providerConfig.providerName;
        chunkModelName = modelName;
        chunkUsage = {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        chunkErrors.push(`${providerConfig.providerName}:${modelName}: ${message}`);
      }
    }

    if (!chunkProviderName) {
      throw new Error(
        `All providers failed for ${params.fileLabel} Q${startIndex + 1}-${chunkEndExclusive}: ${chunkErrors.join(" | ")}`,
      );
    }

    console.log(
      `REWRITE-CHUNK ${params.fileLabel}: questions=${startIndex + 1}-${chunkEndExclusive} provider=${chunkProviderName} model=${chunkModelName} inputTokens=${chunkUsage?.inputTokens ?? 0} outputTokens=${chunkUsage?.outputTokens ?? 0}`,
    );
  }

  const afterWeak = countWeakExplanations(params.paper);
  const placeholders = params.paper.questions.filter((question) =>
    hasPlaceholderStem(question),
  ).length;

  console.log(
    `REWRITE-DONE ${params.fileLabel}: weakAfter=${afterWeak} placeholderQuestions=${placeholders} write=${!params.dryRun}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filter = createPaperAuditFilter(args);
  const dryRun = args.write !== true;
  const scene =
    typeof args.scene === "string"
      ? args.scene.trim()
      : typeof args.task === "string"
        ? args.task.trim()
        : "rewrite";
  const attemptTimeoutMs =
    typeof args.timeout === "string" ? Number.parseInt(args.timeout, 10) : 45_000;
  const modelOverride = typeof args.model === "string" ? args.model : undefined;
  const fileFilter = typeof args.file === "string" ? args.file.trim().toLowerCase() : undefined;
  const fileRegex =
    typeof args["file-regex"] === "string" ? new RegExp(args["file-regex"]) : undefined;
  const chunkSize =
    typeof args["chunk-size"] === "string" ? Number.parseInt(args["chunk-size"], 10) : 4;
  const limit = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : undefined;
  const startQuestion =
    typeof args["start-q"] === "string" ? Number.parseInt(args["start-q"], 10) : 1;
  const endQuestion =
    typeof args["end-q"] === "string" ? Number.parseInt(args["end-q"], 10) : undefined;
  const continueOnError = args["continue-on-error"] === true;

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
  let rewritten = 0;
  const failures: string[] = [];

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    const fileKey = `${info.outDir}/${info.fileName}`.toLowerCase();
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    if (fileFilter && fileKey !== fileFilter && info.fileName.toLowerCase() !== fileFilter) {
      continue;
    }

    if (fileRegex && !fileRegex.test(info.fileName)) {
      continue;
    }

    try {
      await rewritePaper({
        paper,
        filePath: info.filePath,
        fileLabel: `${info.outDir}/${info.fileName}`,
        scene,
        chunkSize,
        attemptTimeoutMs,
        modelOverride,
        dryRun,
        startQuestion,
        endQuestion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!continueOnError) {
        throw error;
      }

      failures.push(`${info.outDir}/${info.fileName}: ${message}`);
      console.error(`REWRITE-FAIL ${info.outDir}/${info.fileName}: ${message}`);
      continue;
    }

    rewritten++;
    if (typeof limit === "number" && rewritten >= limit) {
      break;
    }
  }

  console.log(`REWRITE-SUMMARY papers=${rewritten} write=${!dryRun}`);
  if (failures.length > 0) {
    console.error(`REWRITE-FAILURES count=${failures.length}`);
    failures.forEach((entry) => console.error(`REWRITE-FAILURE ${entry}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
