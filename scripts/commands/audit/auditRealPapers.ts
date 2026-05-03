import {
  listPaperFiles,
  loadPaper,
  isBlank,
  type PaperData,
  type PaperFileInfo,
  type PaperQuestion,
} from "../../lib/paperFiles";
import { alignOfficialProblems } from "../../lib/luoguAnswerAlignment";
import { loadLeafKnowledgePointCodes } from "../../lib/taxonomyCatalog";

export interface PaperAuditFilter {
  outDirs?: Set<string>;
  years?: Set<number>;
}

interface LuoguQuestion {
  correctAnswers: string[];
}

interface LuoguProblem {
  questions: LuoguQuestion[];
}

export type PaperQualityIssueType =
  | "missing_top_stem"
  | "placeholder_top_stem"
  | "missing_sub_stem"
  | "placeholder_sub_stem"
  | "missing_code"
  | "invalid_code_punctuation"
  | "weak_explanation";

export interface PaperQualityIssue {
  type: PaperQualityIssueType;
  slot: "question" | "subQuestion" | "blank";
  index?: number;
  field?: "stem" | "cppCode" | "fullCode" | "explanation";
  detail?: string;
}

export type PaperMetadataIssueType =
  | "invalid_question_type"
  | "invalid_difficulty"
  | "missing_primary_kp"
  | "invalid_primary_kp"
  | "too_many_auxiliary_kp"
  | "invalid_auxiliary_kp"
  | "duplicate_auxiliary_kp"
  | "primary_in_auxiliary"
  | "question_structure_mismatch";

export interface PaperMetadataIssue {
  type: PaperMetadataIssueType;
  field?: "questionType" | "difficulty" | "primaryKpCode" | "auxiliaryKpCodes";
  detail?: string;
}

export type PaperStructureIssueType =
  | "missing_options"
  | "invalid_option_count"
  | "invalid_answer_format"
  | "invalid_code_line_numbers"
  | "suspicious_code_content";

export interface PaperStructureIssue {
  type: PaperStructureIssueType;
  slot: "question" | "subQuestion" | "blank";
  index?: number;
  field?: "options" | "answer" | "cppCode" | "fullCode";
  detail?: string;
}

const explanationTemplatePatterns = [
  /第\d+空选[ABCD]$/,
  /因此应选[ABCD]。?$/,
  /所以应选[ABCD]。?$/,
  /故选[ABCD]。?$/,
  /因此选[ABCD]。?$/,
  /所以选[ABCD]。?$/,
  /选项[ABCD]正确。?$/,
  /答案[为是]? ?[ABCD]。?$/,
  /当前缺少可确认的标准答案/,
  /待官方来源补齐后再补详细解析/,
];

const invalidCodePunctuationPattern = /[（）；｛｝［］]/;
const placeholderStemPattern = /(无法显示|未能从 PDF 提取)/u;
const numberedCodeLinePattern =
  /^\s*\d{1,3}(?:\s{1,3}(#include|using\b|int\b|long\b|double\b|float\b|bool\b|char\b|string\b|vector\b|if\b|for\b|while\b|return\b|cin\b|cout\b|void\b|const\b|struct\b|class\b|template\b|[A-Za-z_])|\s*$)/;
const allowedQuestionTypes = new Set(["single_choice", "reading_program", "completion_program"]);
const allowedDifficulties = new Set(["easy", "medium", "hard"]);
const optionLetters = ["A", "B", "C", "D"] as const;

const qualityMinimumLengths = {
  question: 52,
  subQuestion: 60,
  blank: 60,
} as const;

const qualityIssueOrder: PaperQualityIssueType[] = [
  "missing_top_stem",
  "placeholder_top_stem",
  "missing_sub_stem",
  "placeholder_sub_stem",
  "missing_code",
  "invalid_code_punctuation",
  "weak_explanation",
];

const metadataIssueOrder: PaperMetadataIssueType[] = [
  "invalid_question_type",
  "invalid_difficulty",
  "missing_primary_kp",
  "invalid_primary_kp",
  "too_many_auxiliary_kp",
  "invalid_auxiliary_kp",
  "duplicate_auxiliary_kp",
  "primary_in_auxiliary",
  "question_structure_mismatch",
];

const structureIssueOrder: PaperStructureIssueType[] = [
  "missing_options",
  "invalid_option_count",
  "invalid_answer_format",
  "invalid_code_line_numbers",
  "suspicious_code_content",
];

const knowledgePointCodes = loadLeafKnowledgePointCodes();

export function normalizeAuditText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isWeakExplanationText(
  value: string | undefined,
  options: { minimumLength?: number } = {},
): boolean {
  const text = normalizeAuditText(value);
  const minimumLength = options.minimumLength ?? 28;

  if (text.length < minimumLength) {
    return true;
  }

  const stripped = text.replace(/[\s`*_~]/g, "");
  return explanationTemplatePatterns.some((pattern) => pattern.test(stripped));
}

function hasInvalidCodePunctuation(value: string | undefined): boolean {
  return !isBlank(value) && invalidCodePunctuationPattern.test(value!);
}

function hasInvalidCodeLineNumbers(value: string | undefined): boolean {
  if (isBlank(value)) {
    return false;
  }

  let checkedLines = 0;
  let numberedLines = 0;

  for (const line of value!.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }
    checkedLines++;
    if (numberedCodeLinePattern.test(line)) {
      numberedLines++;
    }
  }

  return checkedLines >= 2 && numberedLines >= Math.min(checkedLines, 3);
}

function hasSuspiciousCodeContent(value: string | undefined): boolean {
  return !isBlank(value) && !/[A-Za-z_#]/.test(value!);
}

function collectOptionIssues(
  issues: PaperStructureIssue[],
  slot: "question" | "subQuestion" | "blank",
  index: number | undefined,
  options: string[] | undefined,
  allowedCounts: readonly number[],
): number {
  if (!Array.isArray(options) || options.length === 0 || options.some((entry) => isBlank(entry))) {
    issues.push({ type: "missing_options", slot, index, field: "options" });
    return 0;
  }

  if (!allowedCounts.includes(options.length)) {
    issues.push({
      type: "invalid_option_count",
      slot,
      index,
      field: "options",
      detail: `count=${options.length}`,
    });
  }

  return options.length;
}

function isValidAnswer(
  answer: string | undefined,
  optionCount: number,
  allowMultiple: boolean,
): boolean {
  const normalized = normalizeAuditText(answer).replace(/\s+/gu, "");
  if (!normalized || !/^[A-D]+$/u.test(normalized)) {
    return false;
  }

  if (!allowMultiple && normalized.length !== 1) {
    return false;
  }

  const uniqueLetters = new Set(normalized.split(""));
  if (uniqueLetters.size !== normalized.length) {
    return false;
  }

  const allowedLetters = new Set(
    optionLetters.slice(0, Math.min(optionCount, optionLetters.length)),
  );
  return [...uniqueLetters].every((entry) =>
    allowedLetters.has(entry as (typeof optionLetters)[number]),
  );
}

function collectAnswerIssue(
  issues: PaperStructureIssue[],
  slot: "question" | "subQuestion" | "blank",
  index: number | undefined,
  answer: string | undefined,
  optionCount: number,
  allowMultiple: boolean,
): void {
  if (!isValidAnswer(answer, optionCount, allowMultiple)) {
    issues.push({
      type: "invalid_answer_format",
      slot,
      index,
      field: "answer",
      detail: normalizeAuditText(answer) || "<empty>",
    });
  }
}

export function collectQuestionStructureIssues(question: PaperQuestion): PaperStructureIssue[] {
  const issues: PaperStructureIssue[] = [];

  if (question.questionType === "single_choice") {
    const optionCount = collectOptionIssues(
      issues,
      "question",
      undefined,
      question.options,
      [2, 4],
    );
    collectAnswerIssue(issues, "question", undefined, question.answer, optionCount, false);
    return issues;
  }

  if (question.questionType === "reading_program") {
    if (hasInvalidCodeLineNumbers(question.cppCode)) {
      issues.push({
        type: "invalid_code_line_numbers",
        slot: "question",
        field: "cppCode",
        detail: "cppCode contains prefixed source line numbers",
      });
    }

    if (hasSuspiciousCodeContent(question.cppCode)) {
      issues.push({
        type: "suspicious_code_content",
        slot: "question",
        field: "cppCode",
        detail: "cppCode does not look like source code content",
      });
    }

    if (question.subQuestions?.length) {
      question.subQuestions.forEach((entry, index) => {
        const optionCount = collectOptionIssues(
          issues,
          "subQuestion",
          index,
          entry.options,
          [2, 4],
        );
        collectAnswerIssue(issues, "subQuestion", index, entry.answer, optionCount, true);
      });
    }

    return issues;
  }

  if (question.questionType === "completion_program") {
    if (hasInvalidCodeLineNumbers(question.fullCode)) {
      issues.push({
        type: "invalid_code_line_numbers",
        slot: "question",
        field: "fullCode",
        detail: "fullCode contains prefixed source line numbers",
      });
    }

    if (hasSuspiciousCodeContent(question.fullCode)) {
      issues.push({
        type: "suspicious_code_content",
        slot: "question",
        field: "fullCode",
        detail: "fullCode does not look like source code content",
      });
    }

    if (question.blanks?.length) {
      question.blanks.forEach((entry, index) => {
        const optionCount = collectOptionIssues(issues, "blank", index, entry.options, [4]);
        collectAnswerIssue(issues, "blank", index, entry.answer, optionCount, true);
      });
    }

    return issues;
  }

  return issues;
}

function hasQuestionStructureMismatch(question: PaperQuestion): boolean {
  if (!allowedQuestionTypes.has(question.questionType)) {
    return true;
  }

  if (question.questionType === "single_choice") {
    return Boolean(
      question.subQuestions?.length ||
      question.blanks?.length ||
      !isBlank(question.cppCode) ||
      !isBlank(question.fullCode),
    );
  }

  if (question.questionType === "reading_program") {
    return (
      isBlank(question.cppCode) || Boolean(question.blanks?.length || !isBlank(question.fullCode))
    );
  }

  return (
    isBlank(question.fullCode) ||
    Boolean(question.subQuestions?.length || !isBlank(question.cppCode))
  );
}

export function collectQuestionMetadataIssues(question: PaperQuestion): PaperMetadataIssue[] {
  const issues: PaperMetadataIssue[] = [];

  if (!allowedQuestionTypes.has(question.questionType)) {
    issues.push({
      type: "invalid_question_type",
      field: "questionType",
      detail: question.questionType,
    });
  }

  if (!allowedDifficulties.has(normalizeAuditText(question.difficulty))) {
    issues.push({ type: "invalid_difficulty", field: "difficulty", detail: question.difficulty });
  }

  const primaryKpCode = normalizeAuditText(question.primaryKpCode);
  if (!primaryKpCode) {
    issues.push({ type: "missing_primary_kp", field: "primaryKpCode" });
  } else if (!knowledgePointCodes.has(primaryKpCode)) {
    issues.push({ type: "invalid_primary_kp", field: "primaryKpCode", detail: primaryKpCode });
  }

  const auxiliaryKpCodes = Array.isArray(question.auxiliaryKpCodes)
    ? question.auxiliaryKpCodes
        .map((entry) => normalizeAuditText(entry))
        .filter((entry) => entry.length > 0)
    : [];
  if (auxiliaryKpCodes.length > 3) {
    issues.push({
      type: "too_many_auxiliary_kp",
      field: "auxiliaryKpCodes",
      detail: `count=${auxiliaryKpCodes.length}`,
    });
  }
  const duplicateAuxiliary = auxiliaryKpCodes.filter(
    (entry, index) => auxiliaryKpCodes.indexOf(entry) !== index,
  );
  if (duplicateAuxiliary.length > 0) {
    issues.push({
      type: "duplicate_auxiliary_kp",
      field: "auxiliaryKpCodes",
      detail: [...new Set(duplicateAuxiliary)].join(","),
    });
  }

  const invalidAuxiliary = auxiliaryKpCodes.filter((entry) => !knowledgePointCodes.has(entry));
  if (invalidAuxiliary.length > 0) {
    issues.push({
      type: "invalid_auxiliary_kp",
      field: "auxiliaryKpCodes",
      detail: [...new Set(invalidAuxiliary)].join(","),
    });
  }

  if (primaryKpCode && auxiliaryKpCodes.includes(primaryKpCode)) {
    issues.push({ type: "primary_in_auxiliary", field: "auxiliaryKpCodes", detail: primaryKpCode });
  }

  if (hasQuestionStructureMismatch(question)) {
    issues.push({ type: "question_structure_mismatch", detail: question.questionType });
  }

  return issues;
}

export function collectQuestionQualityIssues(question: PaperQuestion): PaperQualityIssue[] {
  const issues: PaperQualityIssue[] = [];

  if (isBlank(question.stem)) {
    issues.push({ type: "missing_top_stem", slot: "question", field: "stem" });
  } else if (placeholderStemPattern.test(question.stem)) {
    issues.push({
      type: "placeholder_top_stem",
      slot: "question",
      field: "stem",
      detail: normalizeAuditText(question.stem),
    });
  }

  if (question.questionType === "reading_program") {
    if (isBlank(question.cppCode)) {
      issues.push({ type: "missing_code", slot: "question", field: "cppCode" });
    } else if (hasInvalidCodePunctuation(question.cppCode)) {
      issues.push({
        type: "invalid_code_punctuation",
        slot: "question",
        field: "cppCode",
        detail:
          "cppCode contains full-width punctuation that will break code rendering or compilation",
      });
    }

    if (question.subQuestions?.length) {
      question.subQuestions.forEach((entry, index) => {
        if (isBlank(entry.stem)) {
          issues.push({ type: "missing_sub_stem", slot: "subQuestion", index, field: "stem" });
        } else if (
          /^第\d+小题$/.test(entry.stem.trim()) ||
          placeholderStemPattern.test(entry.stem)
        ) {
          issues.push({
            type: "placeholder_sub_stem",
            slot: "subQuestion",
            index,
            field: "stem",
            detail: entry.stem.trim(),
          });
        }

        if (
          isWeakExplanationText(entry.explanation, {
            minimumLength: qualityMinimumLengths.subQuestion,
          })
        ) {
          issues.push({
            type: "weak_explanation",
            slot: "subQuestion",
            index,
            field: "explanation",
          });
        }
      });
      return issues;
    }

    if (
      isWeakExplanationText(question.explanation, { minimumLength: qualityMinimumLengths.question })
    ) {
      issues.push({ type: "weak_explanation", slot: "question", field: "explanation" });
    }
    return issues;
  }

  if (question.questionType === "completion_program") {
    if (isBlank(question.fullCode)) {
      issues.push({ type: "missing_code", slot: "question", field: "fullCode" });
    } else if (hasInvalidCodePunctuation(question.fullCode)) {
      issues.push({
        type: "invalid_code_punctuation",
        slot: "question",
        field: "fullCode",
        detail:
          "fullCode contains full-width punctuation that will break code rendering or compilation",
      });
    }

    if (question.blanks?.length) {
      question.blanks.forEach((entry, index) => {
        if (
          isWeakExplanationText(entry.explanation, { minimumLength: qualityMinimumLengths.blank })
        ) {
          issues.push({ type: "weak_explanation", slot: "blank", index, field: "explanation" });
        }
      });
      return issues;
    }

    if (
      isWeakExplanationText(question.explanation, { minimumLength: qualityMinimumLengths.question })
    ) {
      issues.push({ type: "weak_explanation", slot: "question", field: "explanation" });
    }
    return issues;
  }

  if (
    isWeakExplanationText(question.explanation, { minimumLength: qualityMinimumLengths.question })
  ) {
    issues.push({ type: "weak_explanation", slot: "question", field: "explanation" });
  }

  return issues;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean | string[]> = { _: [] };

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

function parseCsvArg(value: string | boolean | string[] | undefined): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parts.length > 0 ? parts : undefined;
}

export function createPaperAuditFilter(
  args: Record<string, string | boolean | string[]>,
): PaperAuditFilter {
  const outDirParts = parseCsvArg(args.dir ?? args["out-dir"]);
  const yearParts = parseCsvArg(args.year);
  const filter: PaperAuditFilter = {};

  if (outDirParts) {
    filter.outDirs = new Set(outDirParts.map((item) => item.toLowerCase()));
  }

  if (yearParts) {
    const years = yearParts.map((item) => {
      const year = Number.parseInt(item, 10);
      if (!Number.isInteger(year)) {
        throw new Error(`Invalid year filter: ${item}`);
      }
      return year;
    });
    filter.years = new Set(years);
  }

  return filter;
}

export function matchesPaperAuditFilter(
  info: PaperFileInfo,
  paper: PaperData,
  filter: PaperAuditFilter,
): boolean {
  if (filter.outDirs?.size && !filter.outDirs.has(info.outDir)) {
    return false;
  }

  if (filter.years?.size && !filter.years.has(paper.year)) {
    return false;
  }

  return true;
}

export function getAnswerSlots(question: PaperQuestion): string[] {
  if (question.questionType === "single_choice") {
    return [question.answer ?? ""];
  }

  if (question.questionType === "reading_program") {
    if (question.subQuestions?.length) {
      return question.subQuestions.map((entry) => entry.answer ?? "");
    }
    return isBlank(question.answer) ? [] : [question.answer ?? ""];
  }

  if (question.questionType === "completion_program") {
    if (question.blanks?.length) {
      return question.blanks.map((entry) => entry.answer ?? "");
    }
    return isBlank(question.answer) ? [] : [question.answer ?? ""];
  }

  return [];
}

function getExplanationSlots(question: PaperQuestion): string[] {
  if (question.questionType === "single_choice") {
    return [question.explanation ?? ""];
  }

  if (question.questionType === "reading_program") {
    if (question.subQuestions?.length) {
      return question.subQuestions.map((entry) => entry.explanation ?? "");
    }
    return [question.explanation ?? ""];
  }

  if (question.questionType === "completion_program") {
    if (question.blanks?.length) {
      return question.blanks.map((entry) => entry.explanation ?? "");
    }
    return [question.explanation ?? ""];
  }

  return [];
}

function getCodeStats(question: PaperQuestion): { needsCode: boolean; hasCode: boolean } {
  if (question.questionType === "reading_program") {
    return { needsCode: true, hasCode: !isBlank(question.cppCode) };
  }

  if (question.questionType === "completion_program") {
    return { needsCode: true, hasCode: !isBlank(question.fullCode) };
  }

  return { needsCode: false, hasCode: true };
}

function formatQualityIssueLocation(questionIndex: number, issue: PaperQualityIssue): string {
  if (issue.slot === "question" || typeof issue.index !== "number") {
    return `Q${questionIndex + 1}`;
  }

  return `Q${questionIndex + 1}.${issue.index + 1}`;
}

function formatStructureIssueLocation(questionIndex: number, issue: PaperStructureIssue): string {
  if (issue.slot === "question" || typeof issue.index !== "number") {
    return `Q${questionIndex + 1}`;
  }

  return `Q${questionIndex + 1}.${issue.index + 1}`;
}

async function fetchOfficialProblems(examId: string): Promise<LuoguProblem[] | null> {
  const response = await fetch(`https://ti.luogu.com.cn/problemset/${examId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const match = html.match(/decodeURIComponent\("([^"]+)"\)/);
  if (!match) {
    return null;
  }

  const data = JSON.parse(decodeURIComponent(match[1]!));
  const problems = data.currentData?.problemset?.problems;
  return Array.isArray(problems) ? problems : null;
}

function getOfficialAnswerSlots(problem: LuoguProblem): string[] {
  if (!Array.isArray(problem.questions)) {
    return [];
  }

  return problem.questions.map((entry) =>
    Array.isArray(entry?.correctAnswers) ? entry.correctAnswers.join("") : "",
  );
}

export function normalizeAnswerSlotForComparison(value: string | undefined): string {
  const normalized = normalizeAuditText(value);
  const compact = normalized.replace(/\s+/gu, "");
  return /^[A-D]+$/iu.test(compact) ? compact.toUpperCase() : normalized;
}

async function auditAnswerCoverage(
  compareOfficial: boolean,
  limit?: number,
  failOnMismatch?: boolean,
  filter: PaperAuditFilter = {},
) {
  const files = listPaperFiles();
  let totalSlots = 0;
  let emptySlots = 0;
  let mismatchCount = 0;
  let checkedOfficial = 0;
  let countMismatchFiles = 0;
  let officialMissingSlots = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    for (const question of paper.questions) {
      const slots = getAnswerSlots(question);
      totalSlots += slots.length;
      emptySlots += slots.filter((value) => isBlank(value)).length;
    }

    if (!compareOfficial || !info.examId) {
      continue;
    }

    if (typeof limit === "number" && checkedOfficial >= limit) {
      continue;
    }

    const officialProblems = await fetchOfficialProblems(info.examId);
    checkedOfficial++;

    if (!officialProblems) {
      console.log(`OFFICIAL-SKIP ${info.outDir}/${info.fileName}: unable to fetch ${info.examId}`);
      continue;
    }

    const aligned = alignOfficialProblems(paper.questions.length, officialProblems);
    if (aligned.mode === "mismatch") {
      countMismatchFiles++;
      console.log(
        `ANSWER-COUNT-MISMATCH ${info.outDir}/${info.fileName}: local=${paper.questions.length} official=${aligned.rawCount} usable=${aligned.filteredCount}`,
      );
      continue;
    }

    if (aligned.mode === "filtered") {
      console.log(
        `ANSWER-ALIGNMENT ${info.outDir}/${info.fileName}: local=${paper.questions.length} official=${aligned.rawCount} usable=${aligned.filteredCount}`,
      );
    }

    const count = Math.min(paper.questions.length, aligned.problems.length);
    for (let questionIndex = 0; questionIndex < count; questionIndex++) {
      const question = paper.questions[questionIndex];
      const problem = aligned.problems[questionIndex];
      if (!question || !problem) {
        continue;
      }

      const localSlots = getAnswerSlots(question);
      const officialSlots = getOfficialAnswerSlots(problem);
      if (officialSlots.length === 0) {
        officialMissingSlots++;
        console.log(
          `OFFICIAL-ANSWER-MISSING ${info.outDir}/${info.fileName} Q${questionIndex + 1}`,
        );
        continue;
      }
      const slotCount = Math.min(localSlots.length, officialSlots.length);
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
        const localSlot = localSlots[slotIndex] ?? "";
        const officialSlot = officialSlots[slotIndex] ?? "";
        if (
          normalizeAnswerSlotForComparison(localSlot) !==
          normalizeAnswerSlotForComparison(officialSlot)
        ) {
          mismatchCount++;
          console.log(
            `ANSWER-MISMATCH ${info.outDir}/${info.fileName} Q${questionIndex + 1}.${slotIndex + 1}: local=${localSlot || "<empty>"} official=${officialSlot || "<empty>"}`,
          );
        }
      }
    }
  }

  console.log(
    `ANSWER-SUMMARY total=${totalSlots} empty=${emptySlots} officialChecked=${checkedOfficial} mismatches=${mismatchCount} countMismatches=${countMismatchFiles} officialMissing=${officialMissingSlots}`,
  );
  if (
    failOnMismatch &&
    (mismatchCount > 0 || emptySlots > 0 || countMismatchFiles > 0 || officialMissingSlots > 0)
  ) {
    process.exitCode = 1;
  }
}

function auditExplanationCoverage(failOnEmpty?: boolean, filter: PaperAuditFilter = {}) {
  const files = listPaperFiles();
  let totalSlots = 0;
  let emptySlots = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    for (const question of paper.questions) {
      const slots = getExplanationSlots(question);
      totalSlots += slots.length;
      emptySlots += slots.filter((value) => isBlank(value)).length;
    }
  }

  console.log(`EXPLANATION-SUMMARY total=${totalSlots} empty=${emptySlots}`);
  if (failOnEmpty && emptySlots > 0) {
    process.exitCode = 1;
  }
}

function auditCodePresence(failOnMissing?: boolean, filter: PaperAuditFilter = {}) {
  const files = listPaperFiles();
  let required = 0;
  let missing = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    let fileRequired = 0;
    let fileMissing = 0;
    for (const question of paper.questions) {
      const stats = getCodeStats(question);
      if (!stats.needsCode) {
        continue;
      }
      required++;
      fileRequired++;
      if (!stats.hasCode) {
        missing++;
        fileMissing++;
      }
    }
    console.log(
      `CODE ${info.outDir}/${info.fileName}: required=${fileRequired} missing=${fileMissing}`,
    );
  }

  console.log(`CODE-SUMMARY required=${required} missing=${missing}`);
  if (failOnMissing && missing > 0) {
    process.exitCode = 1;
  }
}

function auditQuality(failOnIssue?: boolean, filter: PaperAuditFilter = {}) {
  const files = listPaperFiles();
  const counts = new Map<PaperQualityIssueType, number>();
  let total = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    let fileIssues = 0;
    paper.questions.forEach((question, questionIndex) => {
      const issues = collectQuestionQualityIssues(question);
      issues.forEach((issue) => {
        total++;
        fileIssues++;
        counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
        const detail = issue.detail ? ` detail=${issue.detail}` : "";
        console.log(
          `QUALITY ${info.outDir}/${info.fileName} ${formatQualityIssueLocation(questionIndex, issue)} type=${issue.type}${detail}`,
        );
      });
    });

    console.log(`QUALITY-FILE ${info.outDir}/${info.fileName}: issues=${fileIssues}`);
  }

  const summary = qualityIssueOrder.map((type) => `${type}=${counts.get(type) ?? 0}`).join(" ");
  console.log(`QUALITY-SUMMARY total=${total} ${summary}`);
  if (failOnIssue && total > 0) {
    process.exitCode = 1;
  }
}

function auditMetadata(failOnIssue?: boolean, filter: PaperAuditFilter = {}) {
  const files = listPaperFiles();
  const counts = new Map<PaperMetadataIssueType, number>();
  let total = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    let fileIssues = 0;
    paper.questions.forEach((question, questionIndex) => {
      const issues = collectQuestionMetadataIssues(question);
      issues.forEach((issue) => {
        total++;
        fileIssues++;
        counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
        const detail = issue.detail ? ` detail=${issue.detail}` : "";
        console.log(
          `METADATA ${info.outDir}/${info.fileName} Q${questionIndex + 1} type=${issue.type}${detail}`,
        );
      });
    });

    console.log(`METADATA-FILE ${info.outDir}/${info.fileName}: issues=${fileIssues}`);
  }

  const summary = metadataIssueOrder.map((type) => `${type}=${counts.get(type) ?? 0}`).join(" ");
  console.log(`METADATA-SUMMARY total=${total} ${summary}`);
  if (failOnIssue && total > 0) {
    process.exitCode = 1;
  }
}

function auditStructure(failOnIssue?: boolean, filter: PaperAuditFilter = {}) {
  const files = listPaperFiles();
  const counts = new Map<PaperStructureIssueType, number>();
  let total = 0;

  for (const info of files) {
    const paper = loadPaper(info.filePath);
    if (!matchesPaperAuditFilter(info, paper, filter)) {
      continue;
    }

    let fileIssues = 0;
    paper.questions.forEach((question, questionIndex) => {
      const issues = collectQuestionStructureIssues(question);
      issues.forEach((issue) => {
        total++;
        fileIssues++;
        counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
        const detail = issue.detail ? ` detail=${issue.detail}` : "";
        console.log(
          `STRUCTURE ${info.outDir}/${info.fileName} ${formatStructureIssueLocation(questionIndex, issue)} type=${issue.type}${detail}`,
        );
      });
    });

    console.log(`STRUCTURE-FILE ${info.outDir}/${info.fileName}: issues=${fileIssues}`);
  }

  const summary = structureIssueOrder.map((type) => `${type}=${counts.get(type) ?? 0}`).join(" ");
  console.log(`STRUCTURE-SUMMARY total=${total} ${summary}`);
  if (failOnIssue && total > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [mode = "all"] = args._ as string[];
  const limit = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : undefined;
  const fail = args.fail === true;
  const filter = createPaperAuditFilter(args);

  if (mode === "answers") {
    await auditAnswerCoverage(args.official === true, limit, fail, filter);
    return;
  }

  if (mode === "coverage") {
    auditExplanationCoverage(fail, filter);
    return;
  }

  if (mode === "code") {
    auditCodePresence(fail, filter);
    return;
  }

  if (mode === "quality") {
    auditQuality(fail, filter);
    return;
  }

  if (mode === "metadata") {
    auditMetadata(fail, filter);
    return;
  }

  if (mode === "structure") {
    auditStructure(fail, filter);
    return;
  }

  if (mode === "all") {
    await auditAnswerCoverage(args.official === true, limit, fail, filter);
    auditExplanationCoverage(fail, filter);
    auditCodePresence(fail, filter);
    auditQuality(fail, filter);
    auditMetadata(fail, filter);
    auditStructure(fail, filter);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
