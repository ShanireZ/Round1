export interface LuoguComparableQuestion {
  correctAnswers?: string[];
}

export interface LuoguComparableProblem {
  questions?: LuoguComparableQuestion[];
}

export type OfficialProblemAlignmentMode = 'direct' | 'filtered' | 'mismatch';

export function hasUsableOfficialAnswers(problem: LuoguComparableProblem): boolean {
  return Array.isArray(problem.questions)
    && problem.questions.some(
      (entry) => Array.isArray(entry.correctAnswers) && entry.correctAnswers.length > 0,
    );
}

export function alignOfficialProblems<T extends LuoguComparableProblem>(
  localQuestionCount: number,
  problems: T[],
): {
  mode: OfficialProblemAlignmentMode;
  problems: T[];
  rawCount: number;
  filteredCount: number;
} {
  const filteredProblems = problems.filter(hasUsableOfficialAnswers);

  if (problems.length === localQuestionCount) {
    return {
      mode: 'direct',
      problems,
      rawCount: problems.length,
      filteredCount: filteredProblems.length,
    };
  }

  if (filteredProblems.length === localQuestionCount) {
    return {
      mode: 'filtered',
      problems: filteredProblems,
      rawCount: problems.length,
      filteredCount: filteredProblems.length,
    };
  }

  return {
    mode: 'mismatch',
    problems,
    rawCount: problems.length,
    filteredCount: filteredProblems.length,
  };
}