import assert from "node:assert/strict";

import {
  buildArchetypePlanForBundle,
  listArchetypesForCombo,
} from "../../config/questionArchetypes.js";
import { blueprintSpecs } from "../../config/blueprint.js";
import {
  QuestionBundleSchema,
  type Difficulty,
  type QuestionBundleItem,
  type QuestionType,
} from "../lib/bundleTypes.js";
import {
  attachPlannedDiversityMeta,
  classifyQuestionDiversity,
  coverageFailuresForBlueprints,
  normalizedTemplateKeyForText,
  validateBundleDiversity,
} from "../lib/questionDiversity.js";
import { computeContentHash } from "../../server/services/deduplicationService.js";

function singleChoice(params: {
  difficulty: Difficulty;
  kpCode: string;
  stem: string;
  options?: string[];
}): QuestionBundleItem {
  const options = params.options ?? ["A. 1", "B. 2", "C. 3", "D. 4"];
  return {
    type: "single_choice",
    difficulty: params.difficulty,
    primaryKpCode: params.kpCode,
    auxiliaryKpCodes: [],
    examTypes: ["GESP-6"],
    contentHash: computeContentHash(params.stem, options.join("\n")),
    sandboxVerified: false,
    source: "ai",
    contentJson: {
      stem: params.stem,
      options,
    },
    answerJson: { answer: "A" },
    explanationJson: { explanation: "按题意逐步推导可得 A。" },
  };
}

function bundle(items: QuestionBundleItem[]) {
  return QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: "2026-04-26.1",
      runId: "2026-05-07-diversity-test-gesp-6-hard-v01",
      createdAt: "2026-05-07T00:00:00.000Z",
      generatedAt: "2026-05-07T00:00:00.000Z",
      provider: "test",
      model: "test",
      promptHash: "a".repeat(64),
      sourceBatchId: "test",
      sourceBatchIds: ["test"],
      sourceTimestamp: "2026-05-07T00:00:00.000Z",
      examType: "GESP-6",
      questionType: "single_choice",
      primaryKpCode: "DS",
      difficulty: "hard",
      requestedCount: items.length,
    },
    items,
  });
}

assert.deepEqual(coverageFailuresForBlueprints(12), []);

for (const spec of Object.values(blueprintSpecs)) {
  for (const section of spec.sections) {
    for (const quota of section.primaryKpQuota) {
      for (const difficulty of Object.keys(section.difficultyDistribution) as Difficulty[]) {
        assert.ok(
          listArchetypesForCombo({
            examType: spec.examType,
            questionType: section.questionType as QuestionType,
            kpGroup: quota.kpCode,
            difficulty,
          }).length >= 12,
          `${spec.examType}|${section.questionType}|${difficulty}|${quota.kpCode}`,
        );
      }
    }
  }
}

const validPlan = buildArchetypePlanForBundle({
  examType: "GESP-6",
  questionType: "single_choice",
  kpGroup: "DS",
  difficulty: "hard",
  bundleNo: 1,
  questionsPerBundle: 3,
  seed: "test",
});

const diverseBundle = bundle([
  attachPlannedDiversityMeta(
    singleChoice({
      difficulty: "hard",
      kpCode: "DS",
      stem: "priority_queue<int> q 依次 push 4,1,7，再连续两次 top/pop，输出序列是什么？",
    }),
    {
      ...validPlan[0]!,
      archetypeId: "ds-priority-queue-order",
      taskFlavor: "priority_queue_order",
      containerTags: ["priority_queue", "heap"],
      codeStructureTags: ["container-simulation", "heap"],
    },
  ),
  attachPlannedDiversityMeta(
    singleChoice({
      difficulty: "hard",
      kpCode: "DS",
      stem: "map<string,int> 统计字符串出现次数后，查询不存在键和已存在键的结果分别是什么？",
    }),
    {
      ...validPlan[1]!,
      archetypeId: "ds-map-count-query",
      taskFlavor: "map_count_lookup",
      containerTags: ["map"],
      codeStructureTags: ["container-simulation", "branch"],
    },
  ),
  attachPlannedDiversityMeta(
    singleChoice({
      difficulty: "hard",
      kpCode: "DS",
      stem: "给定邻接表按升序访问，BFS 从 1 号点开始，第三次出队的点是哪一个？",
    }),
    {
      ...validPlan[2]!,
      archetypeId: "ds-adjacency-list-bfs",
      taskFlavor: "bfs_adjacency_queue",
      containerTags: ["graph", "queue"],
      codeStructureTags: ["graph", "bfs", "queue"],
    },
  ),
]);

assert.equal(validateBundleDiversity(diverseBundle, "fixture").errors.length, 0);

const repetitivePlan = buildArchetypePlanForBundle({
  examType: "GESP-6",
  questionType: "single_choice",
  kpGroup: "DS",
  difficulty: "hard",
  bundleNo: 1,
  questionsPerBundle: 3,
  seed: "repetitive",
});

const repetitiveBundle = bundle(
  [3, 4, 5].map((pushCount, index) =>
    attachPlannedDiversityMeta(
      singleChoice({
        difficulty: "hard",
        kpCode: "DS",
        stem: `一个空栈依次执行 ${pushCount} 次入栈、2 次出栈后，栈中还剩几个元素？`,
      }),
      {
        ...repetitivePlan[index]!,
        archetypeId: "ds-stack-balance-trace",
        taskFlavor: "stack_state_trace",
        containerTags: ["stack"],
        codeStructureTags: ["container-simulation"],
      },
    ),
  ),
);

const repetitiveIssues = validateBundleDiversity(repetitiveBundle, "fixture").errors.map(
  (issue) => issue.code,
);
assert.ok(repetitiveIssues.includes("BUNDLE_DUPLICATE_ARCHETYPE"));
assert.ok(repetitiveIssues.includes("HARD_DIFFICULTY_RUBRIC_FAILED"));

const hardLoop = singleChoice({
  difficulty: "hard",
  kpCode: "ALG",
  stem: "for (int i = 1; i <= 5; i++) ans += i; 循环执行多少次？",
});
const loopMetrics = classifyQuestionDiversity(hardLoop);
assert.equal(loopMetrics.quality.difficultyFit, "fail");
assert.ok(loopMetrics.quality.qualityScore < 0.65);

assert.equal(
  normalizedTemplateKeyForText("int ans=0; for(int i=1;i<=5;i++){ ans += i; }"),
  normalizedTemplateKeyForText("int total=0; for(int k=3;k<=9;k++){ total += k; }"),
);

console.log("questionDiversity: ok");
