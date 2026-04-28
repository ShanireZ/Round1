import type { ExamCatalogItem } from "./exam-runtime";

export type ExamDifficulty = "easy" | "medium" | "hard";

export type ExamNewSelection = {
  examType: string;
  difficulty: ExamDifficulty;
};

export type ExamNewOption = ExamNewSelection & {
  availableCount: number;
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  "CSP-J": "CSP-J",
  "CSP-S": "CSP-S",
  "GESP-1": "GESP 1",
  "GESP-2": "GESP 2",
  "GESP-3": "GESP 3",
  "GESP-4": "GESP 4",
  "GESP-5": "GESP 5",
  "GESP-6": "GESP 6",
  "GESP-7": "GESP 7",
  "GESP-8": "GESP 8",
};

const EXAM_TYPE_DESCRIPTIONS: Record<string, string> = {
  "CSP-J": "入门组节奏，覆盖基础语法、模拟与常见算法。",
  "CSP-S": "提高组节奏，强调复杂度、数据结构和综合题。",
  "GESP-1": "一级基础语法与顺序结构。",
  "GESP-2": "二级分支、循环与基础模拟。",
  "GESP-3": "三级数组、字符串和简单函数。",
  "GESP-4": "四级综合模拟与基础算法。",
  "GESP-5": "五级递推、搜索与复杂模拟。",
  "GESP-6": "六级数据结构与图论入门。",
  "GESP-7": "七级综合算法训练。",
  "GESP-8": "八级竞赛综合挑战。",
};

const DIFFICULTY_ORDER: ExamDifficulty[] = ["easy", "medium", "hard"];

export function isExamDifficulty(value: string): value is ExamDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

export function formatExamTypeLabel(examType: string): string {
  return EXAM_TYPE_LABELS[examType] ?? examType;
}

export function formatExamTypeDescription(examType: string): string {
  return EXAM_TYPE_DESCRIPTIONS[examType] ?? "按当前预制卷目录生成一份固定模拟卷。";
}

export function normalizeExamDifficulties(values: readonly string[]): ExamDifficulty[] {
  const normalized = values.filter(isExamDifficulty);

  return DIFFICULTY_ORDER.filter((difficulty) => normalized.includes(difficulty));
}

export function buildExamNewOptions({
  examTypes,
  difficulties,
  catalogItems,
}: {
  examTypes: readonly string[];
  difficulties: readonly string[];
  catalogItems: readonly ExamCatalogItem[];
}): ExamNewOption[] {
  const safeDifficulties = normalizeExamDifficulties(difficulties);
  const countByKey = new Map(
    catalogItems.map((item) => [`${item.examType}:${item.difficulty}`, item.count] as const),
  );

  return examTypes.flatMap((examType) =>
    safeDifficulties.map((difficulty) => ({
      examType,
      difficulty,
      availableCount: countByKey.get(`${examType}:${difficulty}`) ?? 0,
    })),
  );
}

export function getAvailableExamCount(
  options: readonly ExamNewOption[],
  selection: ExamNewSelection,
): number {
  return (
    options.find(
      (option) =>
        option.examType === selection.examType && option.difficulty === selection.difficulty,
    )?.availableCount ?? 0
  );
}

export function resolveDefaultExamSelection(
  options: readonly ExamNewOption[],
): ExamNewSelection | null {
  const firstAvailable = options.find((option) => option.availableCount > 0);
  const fallback = options[0];

  return firstAvailable ?? fallback ?? null;
}

export function resolveDifficultyForExamType(
  options: readonly ExamNewOption[],
  examType: string,
  preferredDifficulty?: ExamDifficulty | null,
): ExamDifficulty | null {
  const sameTypeOptions = options.filter((option) => option.examType === examType);
  const preferred = sameTypeOptions.find((option) => option.difficulty === preferredDifficulty);
  if (preferred && preferred.availableCount > 0) {
    return preferred.difficulty;
  }

  return (
    sameTypeOptions.find((option) => option.availableCount > 0)?.difficulty ??
    preferred?.difficulty ??
    sameTypeOptions[0]?.difficulty ??
    null
  );
}

export function formatDraftTtlLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "按运行时配置回收";
  }

  if (minutes % 1440 === 0) {
    return `${minutes / 1440} 天`;
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60} 小时`;
  }

  return `${minutes} 分钟`;
}

export function getCreateExamErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "创建试卷失败，请稍后重试。";
}
