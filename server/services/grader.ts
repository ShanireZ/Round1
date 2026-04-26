export type SectionSummary = {
  total: number;
  correct: number;
  score: number;
  maxScore: number;
};

export type PrimaryKpSummary = {
  total: number;
  correct: number;
  accuracy: number;
};

export type WrongAnswerReportItem = {
  slotNo: number;
  questionType: string;
  subQuestionKey: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  points: number;
  explanation: string | null;
};

export type AttemptReport = {
  wrongs: WrongAnswerReportItem[];
};

export type GradingSlot = {
  slotNo: number;
  questionType: string;
  primaryKpId: number;
  points: number;
  answerJson: unknown;
  explanationJson: unknown;
};

export type ResultSlot = GradingSlot & {
  contentJson: unknown;
};

export type AttemptResultSubQuestion = {
  key: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  points: number;
  explanation: string | null;
};

export type AttemptResultItem = {
  slotNo: number;
  questionType: string;
  primaryKpId: number;
  points: number;
  contentJson: unknown;
  submittedAnswers: Record<string, string>;
  result: {
    earnedScore: number;
    maxScore: number;
    correctCount: number;
    totalCount: number;
    subQuestions: AttemptResultSubQuestion[];
  };
};

export type GradingResult = {
  score: number;
  perSectionJson: Record<string, SectionSummary>;
  perPrimaryKpJson: Record<string, PrimaryKpSummary>;
  report: AttemptReport;
  reportStatus: "completed";
};

type ExpectedAnswerEntry = {
  key: string;
  correctAnswer: string;
  explanation: string | null;
};

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stringEntriesFromArray(values: unknown[], startIndex = 1): Array<[string, string]> {
  return values.flatMap((value, index) =>
    typeof value === "string" ? [[String(index + startIndex), value]] : [],
  );
}

function objectAnswerEntries(values: unknown[], startIndex = 1): Array<[string, string]> {
  return values.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }

    const record = value as Record<string, unknown>;
    return typeof record.answer === "string" ? [[String(index + startIndex), record.answer]] : [];
  });
}

function extractExpectedAnswerEntries(
  questionType: string,
  answerJson: unknown,
): ExpectedAnswerEntry[] {
  const record = normalizeRecord(answerJson);

  if (questionType === "single_choice") {
    return typeof record.answer === "string"
      ? [{ key: "0", correctAnswer: record.answer, explanation: null }]
      : [];
  }

  if (questionType === "reading_program") {
    if (Array.isArray(record.subAnswers)) {
      return stringEntriesFromArray(record.subAnswers).map(([key, correctAnswer]) => ({
        key,
        correctAnswer,
        explanation: null,
      }));
    }

    if (Array.isArray(record.subQuestions)) {
      return objectAnswerEntries(record.subQuestions).map(([key, correctAnswer]) => ({
        key,
        correctAnswer,
        explanation: null,
      }));
    }

    if (record.answers && typeof record.answers === "object" && !Array.isArray(record.answers)) {
      return Object.entries(record.answers as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "string" ? [{ key, correctAnswer: value, explanation: null }] : [],
      );
    }

    return [];
  }

  if (Array.isArray(record.blanks)) {
    return record.blanks.flatMap((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }

      const blank = value as Record<string, unknown>;
      return typeof blank.answer === "string"
        ? [{ key: String(index + 1), correctAnswer: blank.answer, explanation: null }]
        : [];
    });
  }

  return [];
}

function extractExplanationMap(
  questionType: string,
  explanationJson: unknown,
): Record<string, string> {
  const record = normalizeRecord(explanationJson);

  if (questionType === "single_choice") {
    if (typeof record.explanation === "string") {
      return { "0": record.explanation };
    }

    if (
      record.perOption &&
      typeof record.perOption === "object" &&
      !Array.isArray(record.perOption)
    ) {
      return Object.entries(record.perOption as Record<string, unknown>)
        .flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as const] : []))
        .reduce<Record<string, string>>((accumulator, [key, value]) => {
          accumulator[key] = value;
          return accumulator;
        }, {});
    }

    return {};
  }

  if (questionType === "reading_program") {
    if (Array.isArray(record.subExplanations)) {
      return stringEntriesFromArray(record.subExplanations).reduce<Record<string, string>>(
        (accumulator, [key, value]) => {
          accumulator[key] = value;
          return accumulator;
        },
        {},
      );
    }

    if (
      record.perSubQuestion &&
      typeof record.perSubQuestion === "object" &&
      !Array.isArray(record.perSubQuestion)
    ) {
      return Object.entries(record.perSubQuestion as Record<string, unknown>)
        .flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as const] : []))
        .reduce<Record<string, string>>((accumulator, [key, value]) => {
          accumulator[key] = value;
          return accumulator;
        }, {});
    }

    return {};
  }

  if (Array.isArray(record.blankExplanations)) {
    return record.blankExplanations.reduce<Record<string, string>>((accumulator, value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return accumulator;
      }

      const blank = value as Record<string, unknown>;
      if (typeof blank.explanation === "string") {
        accumulator[String(index + 1)] = blank.explanation;
      }
      return accumulator;
    }, {});
  }

  return {};
}

function extractSubmittedAnswers(answerEntry: unknown): Record<string, string> {
  if (typeof answerEntry === "string") {
    return { "0": answerEntry };
  }

  const record = normalizeRecord(answerEntry);
  if (Array.isArray(record.subAnswers)) {
    return stringEntriesFromArray(record.subAnswers).reduce<Record<string, string>>(
      (accumulator, [key, value]) => {
        accumulator[key] = value;
        return accumulator;
      },
      {},
    );
  }

  if (
    record.subAnswers &&
    typeof record.subAnswers === "object" &&
    !Array.isArray(record.subAnswers)
  ) {
    return Object.entries(record.subAnswers as Record<string, unknown>).reduce<
      Record<string, string>
    >((accumulator, [key, value]) => {
      if (typeof value === "string") {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
  }

  return Object.entries(record).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (typeof value === "string") {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

function allocateSubQuestionPoints(totalPoints: number, subQuestionCount: number): number[] {
  if (subQuestionCount <= 0) {
    return [];
  }

  const basePoints = Math.floor(totalPoints / subQuestionCount);
  const remainder = totalPoints % subQuestionCount;

  return Array.from(
    { length: subQuestionCount },
    (_value, index) => basePoints + (index < remainder ? 1 : 0),
  );
}

export function buildAttemptResultItems(
  answersJson: Record<string, unknown>,
  slots: readonly ResultSlot[],
): AttemptResultItem[] {
  return slots.map((slot) => {
    const expectedEntries = extractExpectedAnswerEntries(slot.questionType, slot.answerJson);
    const explanationMap = extractExplanationMap(slot.questionType, slot.explanationJson);
    const submittedAnswers = extractSubmittedAnswers(answersJson[String(slot.slotNo)]);
    const subQuestionPoints = allocateSubQuestionPoints(slot.points, expectedEntries.length || 1);

    const subQuestions = expectedEntries.map((entry, index) => {
      const points = subQuestionPoints[index] ?? 0;
      const submittedAnswer = submittedAnswers[entry.key] ?? null;
      return {
        key: entry.key,
        submittedAnswer,
        correctAnswer: entry.correctAnswer,
        isCorrect: submittedAnswer === entry.correctAnswer,
        points,
        explanation: explanationMap[entry.key] ?? entry.explanation ?? null,
      };
    });

    return {
      slotNo: slot.slotNo,
      questionType: slot.questionType,
      primaryKpId: slot.primaryKpId,
      points: slot.points,
      contentJson: slot.contentJson,
      submittedAnswers,
      result: {
        earnedScore: subQuestions.reduce(
          (sum, subQuestion) => sum + (subQuestion.isCorrect ? subQuestion.points : 0),
          0,
        ),
        maxScore: subQuestions.reduce((sum, subQuestion) => sum + subQuestion.points, 0),
        correctCount: subQuestions.filter((subQuestion) => subQuestion.isCorrect).length,
        totalCount: subQuestions.length,
        subQuestions,
      },
    };
  });
}

export function gradeAttemptAnswers(
  answersJson: Record<string, unknown>,
  slots: readonly GradingSlot[],
): GradingResult {
  const perSectionJson: Record<string, SectionSummary> = {};
  const perPrimaryKpCounters: Record<string, { total: number; correct: number }> = {};
  const wrongs: WrongAnswerReportItem[] = [];
  let score = 0;

  for (const slot of slots) {
    const expectedEntries = extractExpectedAnswerEntries(slot.questionType, slot.answerJson);
    const explanationMap = extractExplanationMap(slot.questionType, slot.explanationJson);
    const submittedAnswers = extractSubmittedAnswers(answersJson[String(slot.slotNo)]);
    const subQuestionPoints = allocateSubQuestionPoints(slot.points, expectedEntries.length || 1);

    if (!perSectionJson[slot.questionType]) {
      perSectionJson[slot.questionType] = {
        total: 0,
        correct: 0,
        score: 0,
        maxScore: 0,
      };
    }

    const section = perSectionJson[slot.questionType]!;
    const kpKey = String(slot.primaryKpId);
    if (!perPrimaryKpCounters[kpKey]) {
      perPrimaryKpCounters[kpKey] = { total: 0, correct: 0 };
    }

    const kpCounter = perPrimaryKpCounters[kpKey]!;

    for (const [index, entry] of expectedEntries.entries()) {
      const points = subQuestionPoints[index] ?? 0;
      const submittedAnswer = submittedAnswers[entry.key] ?? null;
      const isCorrect = submittedAnswer === entry.correctAnswer;

      section.total += 1;
      section.correct += isCorrect ? 1 : 0;
      section.score += isCorrect ? points : 0;
      section.maxScore += points;

      kpCounter.total += 1;
      kpCounter.correct += isCorrect ? 1 : 0;

      if (isCorrect) {
        score += points;
        continue;
      }

      wrongs.push({
        slotNo: slot.slotNo,
        questionType: slot.questionType,
        subQuestionKey: entry.key,
        submittedAnswer,
        correctAnswer: entry.correctAnswer,
        points,
        explanation: explanationMap[entry.key] ?? entry.explanation ?? null,
      });
    }
  }

  const perPrimaryKpJson: Record<string, PrimaryKpSummary> = {};
  for (const [kpId, counter] of Object.entries(perPrimaryKpCounters)) {
    perPrimaryKpJson[kpId] = {
      total: counter.total,
      correct: counter.correct,
      accuracy: counter.total === 0 ? 0 : counter.correct / counter.total,
    };
  }

  return {
    score,
    perSectionJson,
    perPrimaryKpJson,
    report: { wrongs },
    reportStatus: "completed",
  };
}
