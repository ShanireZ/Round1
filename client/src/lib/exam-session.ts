export type DraftAnswerEntry = {
  subAnswers: Record<string, string>;
  updatedAt?: string;
};

export type AutosavePhase = "idle" | "dirty" | "saving" | "saved" | "error";

export type CountdownWarningLevel = "normal" | "warning" | "critical" | "expired";

export type DraftAnswers = Record<string, DraftAnswerEntry>;

export type PendingDraftAnswerPatch = {
  slotNo: number;
  subKey: string;
  value: string;
  updatedAt?: string;
};

export type QuestionOption = {
  value: string;
  label: string;
};

export type RenderableQuestionPart = {
  key: string;
  prompt: string;
  inputMode: "choice" | "text";
  options: QuestionOption[];
};

export type RenderableQuestion = {
  prompt: string;
  code: string | null;
  parts: RenderableQuestionPart[];
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

function extractStringMap(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return stringEntriesFromArray(value).reduce<Record<string, string>>(
      (accumulator, [key, item]) => {
        accumulator[key] = item;
        return accumulator;
      },
      {},
    );
  }

  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (accumulator, [key, item]) => {
      if (typeof item === "string") {
        accumulator[key] = item;
      }
      return accumulator;
    },
    {},
  );
}

function inferOptionValue(index: number): string {
  return String.fromCharCode(65 + index);
}

function parseChoiceOption(option: unknown, index: number): QuestionOption | null {
  if (typeof option === "string") {
    const trimmed = option.trim();
    const matched = /^(?<value>[A-Z])\s*[.、:：)]\s*(?<label>.+)$/u.exec(trimmed);
    const matchedValue = matched?.groups?.value;
    const matchedLabel = matched?.groups?.label;
    if (typeof matchedValue === "string" && typeof matchedLabel === "string") {
      return {
        value: matchedValue,
        label: matchedLabel.trim(),
      };
    }

    return {
      value: inferOptionValue(index),
      label: trimmed,
    };
  }

  const record = normalizeRecord(option);
  const labelCandidate = record.label ?? record.text ?? record.content ?? record.value;
  if (typeof labelCandidate !== "string") {
    return null;
  }

  return {
    value: typeof record.value === "string" ? record.value : inferOptionValue(index),
    label: labelCandidate.trim(),
  };
}

function parseChoiceOptions(options: unknown): QuestionOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((option, index) => {
    const parsed = parseChoiceOption(option, index);
    return parsed ? [parsed] : [];
  });
}

export function formatQuestionTypeLabel(questionType: string): string {
  if (questionType === "single_choice") {
    return "单选题";
  }

  if (questionType === "reading_program") {
    return "阅读程序";
  }

  if (questionType === "completion_program") {
    return "完善程序";
  }

  return questionType;
}

export function extractQuestionPrompt(contentJson: unknown): string {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return "题面待补充";
  }

  const record = contentJson as Record<string, unknown>;
  const preferredKeys = ["title", "stem", "prompt", "description", "question", "text"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return JSON.stringify(contentJson).slice(0, 160);
}

function buildSingleChoiceQuestion(contentJson: unknown): RenderableQuestion {
  const record = normalizeRecord(contentJson);
  const options = parseChoiceOptions(record.options);
  return {
    prompt: extractQuestionPrompt(contentJson),
    code: null,
    parts: [
      {
        key: "0",
        prompt: options.length > 0 ? "请选择答案" : "请输入答案",
        inputMode: options.length > 0 ? "choice" : "text",
        options,
      },
    ],
  };
}

function buildReadingProgramQuestion(contentJson: unknown): RenderableQuestion {
  const record = normalizeRecord(contentJson);
  const subQuestions = Array.isArray(record.subQuestions) ? record.subQuestions : [];
  const parts = subQuestions.map((question, index) => {
    const options = parseChoiceOptions(normalizeRecord(question).options);
    return {
      key: String(index + 1),
      prompt: extractQuestionPrompt(question) || `第 ${index + 1} 问`,
      inputMode: options.length > 0 ? "choice" : "text",
      options,
    } satisfies RenderableQuestionPart;
  });

  return {
    prompt: extractQuestionPrompt(contentJson),
    code:
      typeof record.cppCode === "string"
        ? record.cppCode
        : typeof record.code === "string"
          ? record.code
          : null,
    parts: parts.length > 0 ? parts : buildSingleChoiceQuestion(contentJson).parts,
  };
}

function buildCompletionProgramQuestion(contentJson: unknown): RenderableQuestion {
  const record = normalizeRecord(contentJson);
  const blanks = Array.isArray(record.blanks) ? record.blanks : [];
  const parts = blanks.map((blank, index) => {
    const normalizedBlank = normalizeRecord(blank);
    const key =
      typeof normalizedBlank.id === "string" && normalizedBlank.id.length > 0
        ? normalizedBlank.id
        : String(index + 1);
    const options = parseChoiceOptions(normalizedBlank.options);
    return {
      key,
      prompt:
        typeof normalizedBlank.stem === "string" && normalizedBlank.stem.trim().length > 0
          ? normalizedBlank.stem.trim()
          : `第 ${key} 空`,
      inputMode: options.length > 0 ? "choice" : "text",
      options,
    } satisfies RenderableQuestionPart;
  });

  return {
    prompt: extractQuestionPrompt(contentJson),
    code:
      typeof record.fullCode === "string"
        ? record.fullCode
        : typeof record.cppCode === "string"
          ? record.cppCode
          : typeof record.code === "string"
            ? record.code
            : null,
    parts: parts.length > 0 ? parts : buildSingleChoiceQuestion(contentJson).parts,
  };
}

export function buildRenderableQuestion(
  questionType: string,
  contentJson: unknown,
): RenderableQuestion {
  if (questionType === "single_choice") {
    return buildSingleChoiceQuestion(contentJson);
  }

  if (questionType === "reading_program") {
    return buildReadingProgramQuestion(contentJson);
  }

  if (questionType === "completion_program") {
    return buildCompletionProgramQuestion(contentJson);
  }

  return {
    prompt: extractQuestionPrompt(contentJson),
    code: null,
    parts: [
      {
        key: "0",
        prompt: "请输入答案",
        inputMode: "text",
        options: [],
      },
    ],
  };
}

export function normalizeDraftAnswers(value: unknown): DraftAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<DraftAnswers>(
    (accumulator, [slotKey, entry]) => {
      if (typeof entry === "string") {
        accumulator[slotKey] = {
          subAnswers: { "0": entry },
        };
        return accumulator;
      }

      const normalizedEntry = normalizeRecord(entry);
      const subAnswers =
        Object.keys(extractStringMap(normalizedEntry.subAnswers)).length > 0
          ? extractStringMap(normalizedEntry.subAnswers)
          : extractStringMap(normalizedEntry);

      if (Object.keys(subAnswers).length === 0) {
        return accumulator;
      }

      accumulator[slotKey] = {
        subAnswers,
        updatedAt:
          typeof normalizedEntry.updatedAt === "string" ? normalizedEntry.updatedAt : undefined,
      };
      return accumulator;
    },
    {},
  );
}

export function getDraftAnswerValue(answers: DraftAnswers, slotNo: number, subKey: string): string {
  return answers[String(slotNo)]?.subAnswers[subKey] ?? "";
}

export function formatRemainingTime(remainingMs: number): string {
  const clamped = Math.max(remainingMs, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function getSessionCountdownState({
  submitAt,
  now = Date.now(),
}: {
  submitAt: string | null;
  now?: number;
}): {
  remainingMs: number;
  label: string;
  warningLevel: CountdownWarningLevel;
  isExpired: boolean;
} {
  const parsedSubmitAt = submitAt ? new Date(submitAt) : null;
  if (!parsedSubmitAt || Number.isNaN(parsedSubmitAt.getTime())) {
    return {
      remainingMs: 0,
      label: formatRemainingTime(0),
      warningLevel: "expired",
      isExpired: true,
    };
  }

  const remainingMs = Math.max(parsedSubmitAt.getTime() - now, 0);
  let warningLevel: CountdownWarningLevel = "normal";

  if (remainingMs === 0) {
    warningLevel = "expired";
  } else if (remainingMs <= 60_000) {
    warningLevel = "critical";
  } else if (remainingMs <= 10 * 60_000) {
    warningLevel = "warning";
  }

  return {
    remainingMs,
    label: formatRemainingTime(remainingMs),
    warningLevel,
    isExpired: remainingMs === 0,
  };
}

export function shouldBlockBeforeUnload({
  autosavePhase,
  answers,
  lastSavedSnapshot,
  pendingPatchCount = 0,
}: {
  autosavePhase: AutosavePhase;
  answers: DraftAnswers;
  lastSavedSnapshot: string;
  pendingPatchCount?: number;
}): boolean {
  if (autosavePhase === "saving" || pendingPatchCount > 0) {
    return true;
  }

  return JSON.stringify(answers) !== lastSavedSnapshot;
}

export function upsertDraftAnswer(
  answers: DraftAnswers,
  input: {
    slotNo: number;
    subKey: string;
    value: string;
    updatedAt?: string;
  },
): DraftAnswers {
  const slotKey = String(input.slotNo);
  const nextAnswers: DraftAnswers = {
    ...answers,
  };
  const existingEntry = nextAnswers[slotKey];
  const nextSubAnswers = {
    ...(existingEntry?.subAnswers ?? {}),
  };

  if (input.value.trim().length === 0) {
    delete nextSubAnswers[input.subKey];
  } else {
    nextSubAnswers[input.subKey] = input.value;
  }

  if (Object.keys(nextSubAnswers).length === 0) {
    delete nextAnswers[slotKey];
    return nextAnswers;
  }

  nextAnswers[slotKey] = {
    subAnswers: nextSubAnswers,
    updatedAt: input.updatedAt ?? existingEntry?.updatedAt,
  };

  return nextAnswers;
}

export function replayPendingAutosavePatches(
  answers: DraftAnswers,
  patches: PendingDraftAnswerPatch[],
): DraftAnswers {
  return patches.reduce((nextAnswers, patch) => upsertDraftAnswer(nextAnswers, patch), answers);
}
