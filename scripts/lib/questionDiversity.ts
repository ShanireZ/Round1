import fs from "node:fs";
import path from "node:path";

import {
  DIVERSITY_POLICY_VERSION,
  type ArchetypePlanItem,
  listArchetypesForCombo,
} from "../../config/questionArchetypes.js";
import { blueprintSpecs } from "../../config/blueprint.js";
import {
  QuestionBundleSchema,
  QuestionBundleItemSchema,
  type Difficulty,
  type ExamType,
  type QuestionBundle,
  type QuestionBundleItem,
  type QuestionDiversityMeta,
  type QuestionQualityRubric,
  type QuestionType,
} from "./bundleTypes.js";

export interface DiversityMetrics {
  archetypeId: string;
  taskFlavor: string;
  stemPatternFamily: string;
  codeStructureTags: string[];
  containerTags: string[];
  normalizedTemplateKey: string;
  quality: QuestionQualityRubric;
}

export interface DiversityRecord {
  id: string;
  sourcePath: string;
  itemIndex: number;
  bundleRunId: string;
  examTypes: ExamType[];
  questionType: QuestionType;
  difficulty: Difficulty;
  primaryKpCode: string;
  kpGroup: string;
  item: QuestionBundleItem;
  metrics: DiversityMetrics;
}

export interface DiversityValidationIssue {
  code: string;
  severity: "warning" | "error";
  message: string;
  sourcePath?: string;
  itemIndex?: number;
}

export interface DiversityValidationResult {
  policyVersion: string;
  enforced: boolean;
  errors: DiversityValidationIssue[];
  warnings: DiversityValidationIssue[];
}

const CPLUSPLUS_KEYWORDS = new Set([
  "alignas",
  "alignof",
  "and",
  "auto",
  "bool",
  "break",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "deque",
  "double",
  "else",
  "false",
  "for",
  "if",
  "include",
  "int",
  "iostream",
  "long",
  "map",
  "namespace",
  "priority_queue",
  "queue",
  "return",
  "set",
  "stack",
  "std",
  "string",
  "struct",
  "true",
  "using",
  "vector",
  "void",
  "while",
]);

function kpGroupOf(kpCode: string): string {
  return kpCode.split("-")[0]?.toUpperCase() ?? kpCode;
}

function codeForItem(item: QuestionBundleItem): string {
  if (item.type === "single_choice") {
    return item.contentJson.stem;
  }
  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }
  return item.contentJson.fullCode;
}

function combinedTextForItem(item: QuestionBundleItem): string {
  if (item.type === "single_choice") {
    return [item.contentJson.stem, ...item.contentJson.options].join("\n");
  }
  if (item.type === "reading_program") {
    return [
      item.contentJson.stem,
      item.contentJson.cppCode,
      ...item.contentJson.subQuestions.flatMap((question) => [
        question.stem,
        ...question.options,
      ]),
    ].join("\n");
  }
  return [
    item.contentJson.stem,
    item.contentJson.cppCode,
    item.contentJson.fullCode,
    ...item.contentJson.blanks.flatMap((blank) => [blank.id, ...blank.options]),
    ...item.contentJson.sampleInputs,
    ...item.contentJson.expectedOutputs,
  ].join("\n");
}

export function normalizedTemplateKeyForText(text: string): string {
  return text
    .replace(/"(?:\\.|[^"\\])*"/g, "STR")
    .replace(/'(?:\\.|[^'\\])*'/g, "CHR")
    .replace(/\b\d+(?:\.\d+)?\b/g, "NUM")
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) =>
      CPLUSPLUS_KEYWORDS.has(token.toLowerCase()) ? token.toLowerCase() : "ID",
    )
    .replace(/\s+/g, "")
    .replace(/[，。；：、（）【】《》“”‘’]/g, "")
    .toLowerCase()
    .slice(0, 500);
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferTaskFlavor(item: QuestionBundleItem): string {
  const text = combinedTextForItem(item).toLowerCase();
  if (includesAny(text, [/priority_queue/, /优先队列/, /大根堆/, /小根堆/])) {
    return "priority_queue_order";
  }
  if (includesAny(text, [/\bmap\s*</, /unordered_map/, /映射/, /计数查询/])) {
    return "map_count_lookup";
  }
  if (includesAny(text, [/邻接表/, /bfs/, /广度优先/])) {
    return "bfs_adjacency_queue";
  }
  if (includesAny(text, [/\bstack\s*</, /入栈|出栈|栈/])) {
    return "stack_state_trace";
  }
  if (includesAny(text, [/\bqueue\s*</, /入队|出队|队列/])) {
    return "queue_state_trace";
  }
  if (includesAny(text, [/\bdeque\s*</, /双端队列/])) {
    return "deque_two_end_trace";
  }
  if (includesAny(text, [/\bset\s*</, /集合|去重/])) {
    return "set_order_unique";
  }
  if (includesAny(text, [/二分|binary search|lower_bound|upper_bound/])) {
    return "binary_search_boundary";
  }
  if (includesAny(text, [/前缀和|prefix/])) {
    return "prefix_sum_query";
  }
  if (includesAny(text, [/差分|difference/])) {
    return "difference_array_update";
  }
  if (includesAny(text, [/\bdp\b|动态规划|状态转移/])) {
    return "dp_state_transition";
  }
  if (includesAny(text, [/排序|sort|冒泡|选择排序|插入排序|快排|归并/])) {
    return "sorting_trace";
  }
  if (includesAny(text, [/复杂度|o\(/])) {
    return "complexity_bound_reasoning";
  }
  if (includesAny(text, [/循环.*次数|执行.*次|多少次/])) {
    return "loop_iteration_count";
  }
  if (includesAny(text, [/最终.*值|输出.*是多少|结果.*是多少|final/])) {
    return "final_scalar_value";
  }
  return item.type === "completion_program" ? "blank_completion" : "generic_concept";
}

export function inferStemPatternFamily(item: QuestionBundleItem): string {
  const text = combinedTextForItem(item);
  if (item.type === "completion_program") return "blank_completion";
  if (item.type === "reading_program") return "program_trace";
  if (/循环.*次数|执行.*次|多少次/.test(text)) return "loop_count";
  if (/复杂度|O\(/i.test(text)) return "complexity";
  if (/输出|结果|最终/.test(text)) return "final_value";
  if (/下列|正确|错误/.test(text)) return "concept_choice";
  return "short_trace";
}

export function inferCodeStructureTags(item: QuestionBundleItem): string[] {
  const code = codeForItem(item);
  const tags = new Set<string>();
  if (/\bfor\s*\(|\bwhile\s*\(/.test(code)) tags.add("loop");
  if (/\bfor\s*\([^)]*\)[\s\S]*\bfor\s*\(/.test(code)) tags.add("nested-loop");
  if (/\bif\s*\(|\belse\b|switch\s*\(/.test(code)) tags.add("branch");
  if (/\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{[\s\S]*\b\1\s*\(/.test(code)) {
    tags.add("recursion");
  }
  if (/\b(vector|array|\[\])\b/.test(code)) tags.add("array");
  if (/\b(stack|queue|deque|priority_queue|map|set|unordered_map|unordered_set)\s*</.test(code)) {
    tags.add("container");
  }
  if (/adj|graph|边|点|邻接|bfs|dfs/i.test(code)) tags.add("graph");
  if (/\bdp\b|动态规划/i.test(code)) tags.add("dp");
  if (/mid|lower_bound|upper_bound|二分/i.test(code)) tags.add("binary-search");
  if (/class\s+|struct\s+/.test(code)) tags.add("record-or-class");
  if (tags.size === 0) tags.add("concept");
  return [...tags].sort();
}

export function inferContainerTags(item: QuestionBundleItem): string[] {
  const text = combinedTextForItem(item);
  const tags = new Set<string>();
  const checks: Array<[string, RegExp]> = [
    ["stack", /\bstack\s*<|栈/],
    ["queue", /\bqueue\s*<|队列/],
    ["deque", /\bdeque\s*<|双端队列/],
    ["priority_queue", /priority_queue|优先队列|堆/],
    ["map", /\bmap\s*<|unordered_map|映射/],
    ["set", /\bset\s*<|unordered_set|集合/],
    ["vector", /\bvector\s*<|数组|向量/],
    ["tree", /树|tree/],
    ["graph", /图|邻接|graph|bfs|dfs/],
    ["union_find", /并查集|find\(|union/i],
  ];
  for (const [tag, pattern] of checks) {
    if (pattern.test(text)) tags.add(tag);
  }
  return [...tags].sort();
}

function estimateStateVariables(item: QuestionBundleItem, codeTags: string[], containerTags: string[]) {
  const code = codeForItem(item);
  const declarations = new Set<string>();
  for (const match of code.matchAll(
    /\b(?:int|long long|bool|char|string|double|float|vector<[^>]+>|stack<[^>]+>|queue<[^>]+>|deque<[^>]+>|map<[^>]+>|set<[^>]+>)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    declarations.add(match[1]!);
  }
  const structural = Math.max(codeTags.length > 1 ? 1 : 0, containerTags.length);
  const tagComplexity = Math.max(0, codeTags.length - 1);
  return Math.max(1, Math.min(6, declarations.size + structural + tagComplexity));
}

function estimateConceptCount(codeTags: string[], containerTags: string[]) {
  const concepts = new Set<string>([...codeTags, ...containerTags]);
  if (concepts.has("loop") && concepts.has("branch")) concepts.add("conditional-trace");
  return Math.max(1, Math.min(5, concepts.size));
}

function estimateTraceSteps(item: QuestionBundleItem, codeTags: string[]) {
  if (item.type === "reading_program") return Math.max(5, item.contentJson.subQuestions.length);
  if (item.type === "completion_program") return Math.max(4, item.contentJson.blanks.length * 2);
  let steps = 3;
  if (codeTags.includes("loop")) steps += 2;
  if (codeTags.includes("nested-loop")) steps += 3;
  if (codeTags.includes("container")) steps += 2;
  if (codeTags.includes("branch")) steps += 1;
  return steps;
}

function inferTrapType(
  taskFlavor: string,
  codeTags: string[],
  containerTags: string[],
): string | null {
  if (taskFlavor.includes("boundary") || codeTags.includes("binary-search")) {
    return "boundary_or_off_by_one";
  }
  if (containerTags.includes("priority_queue")) return "heap_order_confusion";
  if (containerTags.includes("queue")) return "fifo_lifo_confusion";
  if (containerTags.includes("stack")) return "lifo_fifo_confusion";
  if (containerTags.includes("map")) return "missing_key_or_count_confusion";
  if (codeTags.includes("nested-loop")) return "dependent_loop_bound";
  if (codeTags.includes("branch")) return "branch_condition_direction";
  return null;
}

export function evaluateQuestionQuality(params: {
  item: QuestionBundleItem;
  taskFlavor: string;
  codeStructureTags: string[];
  containerTags: string[];
}): QuestionQualityRubric {
  const reasoningSteps = estimateTraceSteps(params.item, params.codeStructureTags);
  const stateVariables = estimateStateVariables(
    params.item,
    params.codeStructureTags,
    params.containerTags,
  );
  const conceptCount = estimateConceptCount(params.codeStructureTags, params.containerTags);
  const trapType = inferTrapType(
    params.taskFlavor,
    params.codeStructureTags,
    params.containerTags,
  );
  let qualityScore = 0.7;
  let difficultyFit: QuestionQualityRubric["difficultyFit"] = "pass";

  if (params.item.difficulty === "easy") {
    qualityScore = conceptCount <= 2 && reasoningSteps <= 6 ? 0.86 : 0.72;
  } else if (params.item.difficulty === "medium") {
    const hasMediumFeature =
      conceptCount >= 2 ||
      stateVariables >= 2 ||
      params.codeStructureTags.includes("branch") ||
      params.containerTags.length > 0;
    qualityScore = hasMediumFeature ? 0.84 : 0.58;
    difficultyFit = hasMediumFeature ? "pass" : "warning";
  } else {
    const lacksAdvancedHardStructure = !params.codeStructureTags.some((tag) =>
      [
        "nested-loop",
        "binary-search",
        "graph",
        "heap",
        "sorting",
        "recursion",
        "dp",
        "invariant",
      ].includes(tag),
    );
    const simpleHard =
      (params.taskFlavor === "loop_iteration_count" ||
        params.taskFlavor === "final_scalar_value" ||
        params.taskFlavor === "generic_concept" ||
        params.taskFlavor === "stack_state_trace" ||
        params.taskFlavor === "queue_state_trace") &&
      lacksAdvancedHardStructure &&
      stateVariables < 4;
    const hasHardFeature = !simpleHard && conceptCount >= 2 && stateVariables >= 2 && trapType;
    qualityScore = hasHardFeature ? 0.86 : 0.42;
    difficultyFit = hasHardFeature ? "pass" : "fail";
  }

  return {
    reasoningSteps,
    stateVariables,
    conceptCount,
    traceSteps: reasoningSteps,
    trapType,
    difficultyFit,
    qualityScore,
  };
}

export function classifyQuestionDiversity(item: QuestionBundleItem): DiversityMetrics {
  const taskFlavor = item.diversityMeta?.taskFlavor ?? inferTaskFlavor(item);
  const codeStructureTags = [
    ...new Set([...(item.diversityMeta?.codeStructureTags ?? []), ...inferCodeStructureTags(item)]),
  ].sort();
  const containerTags = [
    ...new Set([...(item.diversityMeta?.containerTags ?? []), ...inferContainerTags(item)]),
  ].sort();
  const quality = evaluateQuestionQuality({
    item,
    taskFlavor,
    codeStructureTags,
    containerTags,
  });
  const normalizedTemplateKey = `${item.type}:${taskFlavor}:${normalizedTemplateKeyForText(
    combinedTextForItem(item),
  )}`;
  return {
    archetypeId: item.diversityMeta?.archetypeId ?? `inferred-${taskFlavor}`,
    taskFlavor,
    stemPatternFamily: item.diversityMeta?.stemPatternFamily ?? inferStemPatternFamily(item),
    codeStructureTags,
    containerTags,
    normalizedTemplateKey,
    quality,
  };
}

export function attachPlannedDiversityMeta(
  item: QuestionBundleItem,
  planItem: ArchetypePlanItem,
): QuestionBundleItem {
  const baseMeta: QuestionDiversityMeta = {
    policyVersion: DIVERSITY_POLICY_VERSION,
    archetypeId: planItem.archetypeId,
    taskFlavor: planItem.taskFlavor,
    stemPatternFamily: inferStemPatternFamily(item),
    codeStructureTags: planItem.codeStructureTags,
    containerTags: planItem.containerTags,
    normalizedTemplateKey: normalizedTemplateKeyForText(combinedTextForItem(item)),
    quality: evaluateQuestionQuality({
      item,
      taskFlavor: planItem.taskFlavor,
      codeStructureTags: planItem.codeStructureTags,
      containerTags: planItem.containerTags,
    }),
  };
  return QuestionBundleItemSchema.parse({ ...item, diversityMeta: baseMeta });
}

export function refreshDiversityMeta(item: QuestionBundleItem): QuestionBundleItem {
  if (!item.diversityMeta) {
    return item;
  }
  const metrics = classifyQuestionDiversity(item);
  return QuestionBundleItemSchema.parse({
    ...item,
    diversityMeta: {
      ...item.diversityMeta,
      stemPatternFamily: metrics.stemPatternFamily,
      codeStructureTags: metrics.codeStructureTags,
      containerTags: metrics.containerTags,
      normalizedTemplateKey: metrics.normalizedTemplateKey,
      quality: metrics.quality,
    },
  });
}

export function refreshBundleDiversityMeta(bundle: QuestionBundle): QuestionBundle {
  return QuestionBundleSchema.parse({
    ...bundle,
    items: bundle.items.map(refreshDiversityMeta),
  });
}

function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function addIssue(
  issues: DiversityValidationIssue[],
  code: string,
  message: string,
  record?: DiversityRecord,
) {
  issues.push({
    code,
    severity: "error",
    message,
    sourcePath: record?.sourcePath,
    itemIndex: record?.itemIndex,
  });
}

export function recordsFromBundle(bundle: QuestionBundle, sourcePath: string): DiversityRecord[] {
  return bundle.items.map((item, itemIndex) => {
    const metrics = classifyQuestionDiversity(item);
    return {
      id: `${sourcePath}#${itemIndex}`,
      sourcePath,
      itemIndex,
      bundleRunId: bundle.meta.runId,
      examTypes: item.examTypes,
      questionType: item.type,
      difficulty: item.difficulty,
      primaryKpCode: item.primaryKpCode,
      kpGroup: kpGroupOf(item.primaryKpCode),
      item,
      metrics,
    };
  });
}

export function recordsFromBundleFiles(files: string[]): DiversityRecord[] {
  return files.flatMap((file) => {
    const absolutePath = path.resolve(process.cwd(), file);
    const bundle = QuestionBundleSchema.parse(JSON.parse(fs.readFileSync(absolutePath, "utf8")));
    const repoPath = path.relative(process.cwd(), absolutePath).replaceAll(path.sep, "/");
    return recordsFromBundle(bundle, repoPath);
  });
}

export function validateDiversityRecords(
  records: DiversityRecord[],
  options: { enforceWhenPolicyPresent?: boolean } = {},
): DiversityValidationResult {
  const hasPolicy = records.some(
    (record) => record.item.diversityMeta?.policyVersion === DIVERSITY_POLICY_VERSION,
  );
  const enforced = options.enforceWhenPolicyPresent === true ? hasPolicy : true;
  const errors: DiversityValidationIssue[] = [];
  if (!enforced) {
    return { policyVersion: DIVERSITY_POLICY_VERSION, enforced, errors, warnings: [] };
  }

  const activeRecords = hasPolicy
    ? records.filter((record) => record.item.diversityMeta?.policyVersion === DIVERSITY_POLICY_VERSION)
    : records;

  for (const bucket of groupBy(activeRecords, (record) => record.bundleRunId).values()) {
    for (const [archetypeId, matches] of groupBy(
      bucket,
      (record) => record.metrics.archetypeId,
    )) {
      if (matches.length > 1) {
        addIssue(
          errors,
          "BUNDLE_DUPLICATE_ARCHETYPE",
          `bundle ${matches[0]!.bundleRunId} repeats archetype ${archetypeId}`,
          matches[1],
        );
      }
    }
    for (const [templateKey, matches] of groupBy(
      bucket,
      (record) => record.metrics.normalizedTemplateKey,
    )) {
      if (matches.length > 1) {
        addIssue(
          errors,
          "BUNDLE_DUPLICATE_TEMPLATE_KEY",
          `bundle ${matches[0]!.bundleRunId} contains parameterized template duplicate ${templateKey.slice(
            0,
            80,
          )}`,
          matches[1],
        );
      }
    }
  }

  for (const record of activeRecords) {
    if (
      record.difficulty === "hard" &&
      (record.metrics.quality.difficultyFit === "fail" ||
        record.metrics.quality.qualityScore < 0.65)
    ) {
      addIssue(
        errors,
        "HARD_DIFFICULTY_RUBRIC_FAILED",
        `hard item does not meet rubric: flavor=${record.metrics.taskFlavor}, score=${record.metrics.quality.qualityScore}`,
        record,
      );
    }
  }

  const total = activeRecords.length;
  if (total > 0) {
    const maxFlavorCount = Math.max(1, Math.floor(total * 0.2));
    for (const [taskFlavor, matches] of groupBy(
      activeRecords,
      (record) => record.metrics.taskFlavor,
    )) {
      if (matches.length > maxFlavorCount) {
        addIssue(
          errors,
          "SHARD_TASK_FLAVOR_OVER_LIMIT",
          `taskFlavor ${taskFlavor} appears ${matches.length}/${total}, over limit ${maxFlavorCount}`,
          matches[maxFlavorCount],
        );
      }
    }
    const maxArchetypeCount = Math.max(3, Math.floor(total * 0.1));
    for (const [archetypeId, matches] of groupBy(
      activeRecords,
      (record) => record.metrics.archetypeId,
    )) {
      if (matches.length > maxArchetypeCount) {
        addIssue(
          errors,
          "SHARD_ARCHETYPE_OVER_LIMIT",
          `archetype ${archetypeId} appears ${matches.length}/${total}, over limit ${maxArchetypeCount}`,
          matches[maxArchetypeCount],
        );
      }
    }
  }

  const dsRecords = activeRecords.filter((record) => record.kpGroup === "DS");
  if (dsRecords.length >= 12) {
    const stackQueue = dsRecords.filter(
      (record) =>
        record.metrics.containerTags.includes("stack") ||
        (record.metrics.containerTags.includes("queue") &&
          !record.metrics.containerTags.includes("priority_queue")),
    );
    if (stackQueue.length / dsRecords.length > 0.35) {
      addIssue(
        errors,
        "DS_STACK_QUEUE_OVER_LIMIT",
        `DS stack+queue items are ${stackQueue.length}/${dsRecords.length}, over 35%`,
        stackQueue[Math.floor(dsRecords.length * 0.35)],
      );
    }
    const containerKinds = new Set(dsRecords.flatMap((record) => record.metrics.containerTags));
    if (containerKinds.size < 4) {
      addIssue(
        errors,
        "DS_CONTAINER_COVERAGE_TOO_NARROW",
        `DS shard covers ${containerKinds.size} container kinds, expected at least 4`,
        dsRecords[0],
      );
    }
  }

  for (const [gridKey, matches] of groupBy(
    activeRecords.flatMap((record) =>
      record.examTypes.map((examType) => ({ ...record, gridExamType: examType })),
    ),
    (record) =>
      `${record.gridExamType}|${record.questionType}|${record.difficulty}|${record.kpGroup}`,
  )) {
    if (matches.length < 20) {
      continue;
    }
    const maxGridArchetype = Math.max(3, Math.floor(matches.length * 0.15));
    for (const [archetypeId, archetypeMatches] of groupBy(
      matches,
      (record) => record.metrics.archetypeId,
    )) {
      if (archetypeMatches.length > maxGridArchetype) {
        addIssue(
          errors,
          "GRID_ARCHETYPE_OVER_LIMIT",
          `${gridKey} archetype ${archetypeId} appears ${archetypeMatches.length}/${matches.length}, over limit ${maxGridArchetype}`,
          archetypeMatches[maxGridArchetype],
        );
      }
    }
  }

  for (const [templateKey, matches] of groupBy(
    activeRecords,
    (record) => record.metrics.normalizedTemplateKey,
  )) {
    if (matches.length > 1) {
      addIssue(
        errors,
        "SHARD_PARAMETERIZED_TEMPLATE_DUPLICATE",
        `parameterized template key repeated ${matches.length} times: ${templateKey.slice(0, 80)}`,
        matches[1],
      );
    }
  }

  return { policyVersion: DIVERSITY_POLICY_VERSION, enforced, errors, warnings: [] };
}

export function validateBundleDiversity(bundle: QuestionBundle, sourcePath: string) {
  return validateDiversityRecords(recordsFromBundle(bundle, sourcePath), {
    enforceWhenPolicyPresent: true,
  });
}

export function validateQuestionBundleFilesDiversity(files: string[]) {
  return validateDiversityRecords(recordsFromBundleFiles(files), {
    enforceWhenPolicyPresent: true,
  });
}

export function formatDiversityIssue(issue: DiversityValidationIssue) {
  const location =
    issue.sourcePath !== undefined
      ? `${issue.sourcePath}${issue.itemIndex !== undefined ? `#${issue.itemIndex}` : ""}: `
      : "";
  return `${location}${issue.code}: ${issue.message}`;
}

export interface DiversityAuditSummary {
  generatedAt: string;
  reportType: "question_diversity_audit_2026";
  policyVersion: string;
  totals: {
    items: number;
    policyTaggedItems: number;
    lowQualityCandidates: number;
    rewriteCandidates: number;
    templateClusters: number;
  };
  distributions: {
    byGrid: Array<{
      key: string;
      count: number;
      archetypes: Record<string, number>;
      taskFlavors: Record<string, number>;
      stemPatternFamilies: Record<string, number>;
      containerTags: Record<string, number>;
    }>;
  };
  templateClusters: Array<{
    normalizedTemplateKey: string;
    count: number;
    itemIds: string[];
  }>;
  rewriteQueue: Array<{
    id: string;
    sourcePath: string;
    itemIndex: number;
    examTypes: ExamType[];
    questionType: QuestionType;
    difficulty: Difficulty;
    kpGroup: string;
    archetypeId: string;
    taskFlavor: string;
    qualityScore: number;
    reasons: string[];
  }>;
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

export function buildDiversityAudit(records: DiversityRecord[]): DiversityAuditSummary {
  const byGrid = new Map<string, DiversityRecord[]>();
  for (const record of records) {
    for (const examType of record.examTypes) {
      const key = `${examType}|${record.questionType}|${record.difficulty}|${record.kpGroup}`;
      byGrid.set(key, [...(byGrid.get(key) ?? []), record]);
    }
  }

  const templateClusters = [...groupBy(records, (record) => record.metrics.normalizedTemplateKey)]
    .filter(([_key, matches]) => matches.length > 1)
    .map(([normalizedTemplateKey, matches]) => ({
      normalizedTemplateKey,
      count: matches.length,
      itemIds: matches.map((record) => record.id),
    }))
    .sort((left, right) => right.count - left.count);

  const clusteredIds = new Set(templateClusters.flatMap((cluster) => cluster.itemIds));
  const rewriteQueue = records
    .map((record) => {
      const reasons: string[] = [];
      if (record.metrics.quality.qualityScore < 0.65) reasons.push("qualityScore_below_0.65");
      if (record.difficulty === "hard" && record.metrics.quality.difficultyFit === "fail") {
        reasons.push("hard_difficulty_rubric_failed");
      }
      if (clusteredIds.has(record.id)) reasons.push("parameterized_template_cluster");
      if (
        record.kpGroup === "DS" &&
        (record.metrics.taskFlavor === "stack_state_trace" ||
          record.metrics.taskFlavor === "queue_state_trace")
      ) {
        reasons.push("ds_stack_queue_overused_candidate");
      }
      return reasons.length === 0
        ? null
        : {
            id: record.id,
            sourcePath: record.sourcePath,
            itemIndex: record.itemIndex,
            examTypes: record.examTypes,
            questionType: record.questionType,
            difficulty: record.difficulty,
            kpGroup: record.kpGroup,
            archetypeId: record.metrics.archetypeId,
            taskFlavor: record.metrics.taskFlavor,
            qualityScore: record.metrics.quality.qualityScore,
            reasons,
          };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort(
      (left, right) =>
        left.qualityScore - right.qualityScore ||
        right.reasons.length - left.reasons.length ||
        left.id.localeCompare(right.id),
    );

  return {
    generatedAt: new Date().toISOString(),
    reportType: "question_diversity_audit_2026",
    policyVersion: DIVERSITY_POLICY_VERSION,
    totals: {
      items: records.length,
      policyTaggedItems: records.filter(
        (record) => record.item.diversityMeta?.policyVersion === DIVERSITY_POLICY_VERSION,
      ).length,
      lowQualityCandidates: records.filter((record) => record.metrics.quality.qualityScore < 0.65)
        .length,
      rewriteCandidates: rewriteQueue.length,
      templateClusters: templateClusters.length,
    },
    distributions: {
      byGrid: [...byGrid.entries()]
        .map(([key, matches]) => {
          const archetypes: Record<string, number> = {};
          const taskFlavors: Record<string, number> = {};
          const stemPatternFamilies: Record<string, number> = {};
          const containerTags: Record<string, number> = {};
          for (const match of matches) {
            increment(archetypes, match.metrics.archetypeId);
            increment(taskFlavors, match.metrics.taskFlavor);
            increment(stemPatternFamilies, match.metrics.stemPatternFamily);
            for (const tag of match.metrics.containerTags) increment(containerTags, tag);
          }
          return { key, count: matches.length, archetypes, taskFlavors, stemPatternFamilies, containerTags };
        })
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
    },
    templateClusters,
    rewriteQueue,
  };
}

export function coverageFailuresForBlueprints(minimum = 12) {
  const failures: Array<{
    examType: ExamType;
    questionType: QuestionType;
    difficulty: Difficulty;
    kpGroup: string;
    count: number;
  }> = [];
  for (const spec of Object.values(blueprintSpecs)) {
    for (const section of spec.sections) {
      for (const quota of section.primaryKpQuota) {
        for (const difficulty of Object.keys(section.difficultyDistribution) as Difficulty[]) {
          const count = listArchetypesForCombo({
            examType: spec.examType,
            questionType: section.questionType,
            kpGroup: quota.kpCode,
            difficulty,
          }).length;
          if (count < minimum) {
            failures.push({
              examType: spec.examType,
              questionType: section.questionType,
              difficulty,
              kpGroup: quota.kpCode,
              count,
            });
          }
        }
      }
    }
  }
  return failures;
}
