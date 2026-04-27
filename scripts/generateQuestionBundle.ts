import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { defaultQuestionBundleOutputPath, formatOfflineRunId } from "./lib/paperPaths.js";
import {
  DifficultySchema,
  ExamTypeSchema,
  QuestionBundleItemSchema,
  QuestionBundleSchema,
  QuestionTypeSchema,
  BUNDLE_SCHEMA_VERSION,
  computeChecksum,
} from "./lib/bundleTypes.js";

type ComputeContentHash = (stem: string, codeOrOptions: string) => string;

const generatedSingleChoiceSchema = z.object({
  stem: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  answer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(10),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

const generatedReadingProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  subQuestions: z
    .array(
      z.object({
        stem: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
        answer: z.enum(["A", "B", "C", "D"]),
        explanation: z.string().min(10),
      }),
    )
    .min(3)
    .max(6),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

const generatedCompletionProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  blanks: z
    .array(
      z.object({
        id: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
        answer: z.enum(["A", "B", "C", "D"]),
        explanation: z.string().min(10),
      }),
    )
    .min(2)
    .max(6),
  fullCode: z.string().min(30),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

interface GenerateArgs {
  examType: string;
  questionType: string;
  primaryKpCode: string;
  difficulty: string;
  count: number;
  output: string;
  outputExplicit: boolean;
  runId: string;
  artifactVersion: number;
}

function printHelp() {
  console.log(`Usage: tsx scripts/generateQuestionBundle.ts --exam-type <type> --question-type <type> --primary-kp-code <code> --difficulty <level> [options]

Options:
  --exam-type <type>         Exam type, e.g. CSP-J
  --question-type <type>     single_choice | reading_program | completion_program
  --primary-kp-code <code>   Knowledge point code
  --difficulty <level>       easy | medium | hard
  --count <number>           Number of questions to generate (default: 1)
  --run-id <id>              Offline run id (default: YYYY-MM-DD-step3-llm-<exam-type>-<difficulty>-vNN)
  --artifact-version <n>     Artifact version used in run id and file name (default: 1)
  --output <path>            Explicit output override. Defaults to the persistent runId question-bundle path.
  --help                     Show this help message
`);
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(argv: string[]): GenerateArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const questionType = QuestionTypeSchema.parse(values.get("question-type"));
  const examType = ExamTypeSchema.parse(values.get("exam-type"));
  const difficulty = DifficultySchema.parse(values.get("difficulty"));
  const primaryKpCode = values.get("primary-kp-code")?.trim() ?? "";
  const count = parsePositiveInteger(values.get("count"), 1, "count");
  const artifactVersion = parsePositiveInteger(
    values.get("artifact-version"),
    1,
    "artifact-version",
  );
  const runId =
    values.get("run-id") ??
    formatOfflineRunId({
      date: new Date(),
      pipeline: "step3-llm",
      examType,
      difficulty,
      versionNo: artifactVersion,
    });
  const outputExplicit = values.has("output");

  return {
    examType,
    questionType,
    primaryKpCode,
    difficulty,
    count,
    output:
      values.get("output") ??
      defaultQuestionBundleOutputPath({
        runId,
        questionType,
        kpCode: primaryKpCode || "unknown-kp",
        count,
        versionNo: artifactVersion,
      }),
    outputExplicit,
    runId,
    artifactVersion,
  };
}

function applyTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function getGeneratedQuestionSchema(questionType: string): {
  schema: z.ZodSchema<unknown>;
  schemaName: string;
  maxTokens: number;
} {
  if (questionType === "single_choice") {
    return {
      schema: generatedSingleChoiceSchema,
      schemaName: "GeneratedSingleChoiceQuestion",
      maxTokens: 2_400,
    };
  }

  if (questionType === "reading_program") {
    return {
      schema: generatedReadingProgramSchema,
      schemaName: "GeneratedReadingProgramQuestion",
      maxTokens: 6_000,
    };
  }

  return {
    schema: generatedCompletionProgramSchema,
    schemaName: "GeneratedCompletionProgramQuestion",
    maxTokens: 6_000,
  };
}

function normalizeGeneratedQuestion(
  payload: Record<string, unknown>,
  args: GenerateArgs,
  computeContentHash: ComputeContentHash,
) {
  const auxiliaryKpCodes = Array.isArray(payload.auxiliaryKpCodes)
    ? payload.auxiliaryKpCodes.filter((value): value is string => typeof value === "string")
    : [];

  if (args.questionType === "single_choice") {
    const contentJson = {
      stem: String(payload.stem ?? ""),
      options: Array.isArray(payload.options) ? payload.options.map(String) : [],
    };

    const item = {
      type: args.questionType,
      difficulty: args.difficulty,
      primaryKpCode: args.primaryKpCode,
      auxiliaryKpCodes,
      examTypes: [args.examType],
      contentHash: computeContentHash(contentJson.stem, contentJson.options.join("\n")),
      sandboxVerified: false,
      source: "ai" as const,
      contentJson,
      answerJson: {
        answer: String(payload.answer ?? ""),
      },
      explanationJson: {
        explanation: String(payload.explanation ?? ""),
      },
    };

    return QuestionBundleItemSchema.parse(item);
  }

  if (args.questionType === "reading_program") {
    const subQuestions = Array.isArray(payload.subQuestions)
      ? payload.subQuestions.map((question) => {
          const record = question as Record<string, unknown>;
          return {
            stem: String(record.stem ?? ""),
            options: Array.isArray(record.options) ? record.options.map(String) : [],
          };
        })
      : [];
    const contentJson = {
      stem: String(payload.stem ?? ""),
      cppCode: String(payload.cppCode ?? ""),
      subQuestions,
      sampleInputs: Array.isArray(payload.sampleInputs) ? payload.sampleInputs.map(String) : [],
      expectedOutputs: Array.isArray(payload.expectedOutputs)
        ? payload.expectedOutputs.map(String)
        : [],
    };

    const answerJson = {
      subQuestions: Array.isArray(payload.subQuestions)
        ? payload.subQuestions.map((question) => ({
            answer: String((question as Record<string, unknown>).answer ?? ""),
          }))
        : [],
    };

    const item = {
      type: args.questionType,
      difficulty: args.difficulty,
      primaryKpCode: args.primaryKpCode,
      auxiliaryKpCodes,
      examTypes: [args.examType],
      contentHash: computeContentHash(contentJson.stem, contentJson.cppCode),
      sandboxVerified: false,
      source: "ai" as const,
      contentJson,
      answerJson,
      explanationJson: {
        explanation: Array.isArray(payload.subQuestions)
          ? payload.subQuestions
              .map(
                (question, index) =>
                  `${index + 1}. ${String((question as Record<string, unknown>).explanation ?? "")}`,
              )
              .join("\n")
          : String(payload.explanation ?? ""),
      },
    };

    return QuestionBundleItemSchema.parse(item);
  }

  const blanks = Array.isArray(payload.blanks)
    ? payload.blanks.map((blank) => {
        const record = blank as Record<string, unknown>;
        return {
          id: String(record.id ?? ""),
          options: Array.isArray(record.options) ? record.options.map(String) : [],
        };
      })
    : [];
  const contentJson = {
    stem: String(payload.stem ?? ""),
    cppCode: String(payload.cppCode ?? ""),
    blanks,
    fullCode: String(payload.fullCode ?? ""),
    sampleInputs: Array.isArray(payload.sampleInputs) ? payload.sampleInputs.map(String) : [],
    expectedOutputs: Array.isArray(payload.expectedOutputs)
      ? payload.expectedOutputs.map(String)
      : [],
  };
  const answerJson = {
    blanks: Array.isArray(payload.blanks)
      ? payload.blanks.map((blank) => ({
          id: String((blank as Record<string, unknown>).id ?? ""),
          answer: String((blank as Record<string, unknown>).answer ?? ""),
        }))
      : [],
  };

  const item = {
    type: args.questionType,
    difficulty: args.difficulty,
    primaryKpCode: args.primaryKpCode,
    auxiliaryKpCodes,
    examTypes: [args.examType],
    contentHash: computeContentHash(contentJson.stem, contentJson.fullCode),
    sandboxVerified: false,
    source: "ai" as const,
    contentJson,
    answerJson,
    explanationJson: {
      explanation: Array.isArray(payload.blanks)
        ? payload.blanks
            .map(
              (blank, index) =>
                `${index + 1}. ${String((blank as Record<string, unknown>).explanation ?? "")}`,
            )
            .join("\n")
        : String(payload.explanation ?? ""),
    },
  };

  return QuestionBundleItemSchema.parse(item);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const args = parseArgs(argv);
  if (!args.primaryKpCode) {
    throw new Error("--primary-kp-code is required");
  }

  if (!Number.isInteger(args.count) || args.count <= 0) {
    throw new Error("--count must be a positive integer");
  }

  const [{ eq }, { db }, { knowledgePoints }, { computeContentHash }, { llmGenerateObject }] =
    await Promise.all([
      import("drizzle-orm"),
      import("../server/db.js"),
      import("../server/db/schema/knowledgePoints.js"),
      import("../server/services/deduplicationService.js"),
      import("../server/services/llm/index.js"),
    ]);

  const promptTemplate = await readFile(
    path.join(process.cwd(), "prompts", "generate-initial.md"),
    "utf8",
  );
  const promptHash = computeChecksum(promptTemplate);
  const sourceTimestamp = new Date().toISOString();
  const sourceBatchId = `generate-question-bundle-v1:${args.examType}:${args.questionType}:${args.primaryKpCode}:${args.difficulty}:${sourceTimestamp}`;
  const [knowledgePoint] = await db
    .select({ code: knowledgePoints.code, name: knowledgePoints.name })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.code, args.primaryKpCode))
    .limit(1);

  if (!knowledgePoint) {
    throw new Error(`Unknown primary kp code: ${args.primaryKpCode}`);
  }

  const items = [];
  const generationSchema = getGeneratedQuestionSchema(args.questionType);

  for (let index = 0; index < args.count; index += 1) {
    const prompt = applyTemplate(promptTemplate, {
      examType: args.examType,
      questionType: args.questionType,
      kpName: knowledgePoint.name,
      kpCode: args.primaryKpCode,
      difficulty: args.difficulty,
      fewShotExamples: "[]",
    });

    const result = await llmGenerateObject({
      task: "generate",
      schema: generationSchema.schema,
      schemaName: generationSchema.schemaName,
      system: "你是算法竞赛中文命题专家，只输出 JSON。",
      prompt,
      maxTokens: generationSchema.maxTokens,
      temperature: 0.72,
    });

    const generated = result.data as Record<string, unknown>;
    const item = normalizeGeneratedQuestion(generated, args, computeContentHash);
    items.push(item);

    if (index === args.count - 1) {
      const bundle = QuestionBundleSchema.parse({
        meta: {
          bundleType: "question_bundle",
          schemaVersion: BUNDLE_SCHEMA_VERSION,
          runId: args.runId,
          createdAt: sourceTimestamp,
          generatedAt: sourceTimestamp,
          provider: result.provider,
          model: result.model,
          promptHash,
          sourceBatchId,
          sourceBatchIds: [sourceBatchId],
          sourceTimestamp,
          examType: args.examType,
          questionType: args.questionType,
          primaryKpCode: args.primaryKpCode,
          difficulty: args.difficulty,
          requestedCount: args.count,
        },
        items,
      });

      const outputPath = path.resolve(process.cwd(), args.output);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        `${JSON.stringify(bundle, null, 2)}\n`,
        args.outputExplicit ? "utf8" : { encoding: "utf8", flag: "wx" },
      );
      console.log(`Generated ${bundle.items.length} questions -> ${outputPath}`);
      return;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
