function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ReviewContinuationPromptOptions {
  metadataOnly?: boolean;
}

export type RewriteQuestionType = "single_choice" | "reading_program" | "completion_program";

interface RewriteContinuationPromptOptions {
  questionTypes?: RewriteQuestionType[];
}

function isJsonStructureError(message: string): boolean {
  return (
    message.includes("Unexpected end of JSON input") ||
    message.includes("Unexpected token") ||
    message.includes("JSON")
  );
}

function formatPrompt(params: {
  intro: string;
  category: string;
  items: string[];
  rules: string[];
}): string {
  return [
    params.intro,
    `问题类别：${params.category}`,
    "待修正项：",
    ...params.items.map((item) => `- ${item}`),
    "输出要求：",
    ...params.rules.map((rule, index) => `${index + 1}. ${rule}`),
  ].join("\n");
}

function buildRewriteItems(
  message: string,
  options: RewriteContinuationPromptOptions,
): { category: string; items: string[] } {
  if (isJsonStructureError(message)) {
    return {
      category: "JSON 结构错误",
      items: [
        "补全缺失的 JSON 结构，确保括号、引号、逗号和数组闭合正确。",
        '最外层必须是完整的 {"questions":[...]} 对象。',
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const missingExplanationMatch = message.match(/Missing explanation for (Q\d+(?:\.\d+)?)/);
  if (missingExplanationMatch) {
    return {
      category: "内容校验失败",
      items: [
        `${missingExplanationMatch[1]}：补全 explanation，不能为空，且要保持中文推导式解析。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const missingReadingMatch = message.match(/Missing reading explanation for (Q\d+(?:\.\d+)?)/);
  if (missingReadingMatch) {
    return {
      category: "内容校验失败",
      items: [
        `${missingReadingMatch[1]}：补全阅读程序解析，不能为空；有子题时请放入 subExplanations。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const missingCompletionMatch = message.match(
    /Missing completion explanation for (Q\d+(?:\.\d+)?)/,
  );
  if (missingCompletionMatch) {
    return {
      category: "内容校验失败",
      items: [
        `${missingCompletionMatch[1]}：补全 explanation，不能为空；有空位时请放入 blankExplanations。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const subExplanationMismatch = message.match(/Sub-question explanation mismatch for (Q\d+)/);
  if (subExplanationMismatch) {
    return {
      category: "内容校验失败",
      items: [
        `${subExplanationMismatch[1]}：subExplanations 数量必须与子题数量完全一致。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const blankExplanationMismatch = message.match(/Blank explanation mismatch for (Q\d+)/);
  if (blankExplanationMismatch) {
    return {
      category: "内容校验失败",
      items: [
        `${blankExplanationMismatch[1]}：blankExplanations 数量必须与空位数量完全一致。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  const chunkLengthMismatch = message.match(
    /Chunk response length mismatch: expected (\d+), got (\d+)/,
  );
  if (chunkLengthMismatch) {
    return {
      category: "内容校验失败",
      items: [
        `questions 数量错误：应返回 ${chunkLengthMismatch[1]} 条，当前返回 ${chunkLengthMismatch[2]} 条。`,
        ...buildRewriteQuestionTypeItems(options.questionTypes),
      ],
    };
  }

  return {
    category: "内容校验失败",
    items: [
      `根据自动校验反馈修正对应字段：${message}`,
      ...buildRewriteQuestionTypeItems(options.questionTypes),
    ],
  };
}

function buildRewriteQuestionTypeItems(questionTypes: RewriteQuestionType[] | undefined): string[] {
  const uniqueTypes = [...new Set(questionTypes ?? [])];
  return uniqueTypes.map((questionType) => {
    switch (questionType) {
      case "single_choice":
        return "这是 single_choice 题；不要返回 subExplanations 或 blankExplanations。single_choice 题只能返回 explanation，并说明正确项成立原因。";
      case "reading_program":
        return "这是 reading_program 题；如果该题有子题，就只能返回 subExplanations；否则返回 explanation。reading_program 题要围绕程序执行过程组织解析。";
      case "completion_program":
        return "这是 completion_program 题；如果该题有空位，就只能返回 blankExplanations；否则返回 explanation。completion_program 题要说明空位在整体算法中的作用。";
      default:
        return questionType satisfies never;
    }
  });
}

function buildReviewItems(
  message: string,
  options: ReviewContinuationPromptOptions,
): { category: string; items: string[] } {
  if (isJsonStructureError(message)) {
    return {
      category: "JSON 结构错误",
      items: [
        "补全缺失的 JSON 结构，确保 JSON 可以直接被解析。",
        '最外层必须是完整的 {"questions":[...]} 对象。',
      ],
    };
  }

  const correctionPrefix = "review requires correction:";
  if (message.startsWith(correctionPrefix)) {
    const details = message
      .slice(correctionPrefix.length)
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const items = details.flatMap((detail) => {
      const match = detail.match(/^(Q\d+(?:\.\d+)?)\s+(skipped|warning):\s+(.+)$/);
      if (!match) {
        return [`按自动审校反馈修正：${detail}`];
      }

      const questionLabel = match[1];
      const kind = match[2];
      const reason = match[3];
      if (!questionLabel || !kind || !reason) {
        return [buildGenericReviewReasonItem("当前题目", "skipped", detail, options)];
      }

      return buildReviewReasonItems(questionLabel, kind, reason, options);
    });

    return {
      category: "审校结果需修正",
      items,
    };
  }

  return {
    category: "审校结果需修正",
    items: [`根据自动审校反馈修正对应字段：${message}`],
  };
}

function buildReviewReasonItems(
  questionLabel: string,
  kind: string,
  reason: string,
  options: ReviewContinuationPromptOptions,
): string[] {
  const reasonParts = reason
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const items = reasonParts.map((part) => mapReviewReasonPart(questionLabel, kind, part, options));
  return items.length > 0
    ? items
    : [buildGenericReviewReasonItem(questionLabel, kind, reason, options)];
}

function mapReviewReasonPart(
  questionLabel: string,
  kind: string,
  reason: string,
  options: ReviewContinuationPromptOptions,
): string {
  const metadataOnly = options.metadataOnly === true;

  switch (reason) {
    case "low confidence":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核，先修正 questionType、difficulty、知识点和状态字段，再重新评估 confidence；只有能明确自证时才给 high 或 medium。`;
      }
      return `${questionLabel}：置信度过低。请重新审校该题，并只在能够明确自证时才给出 high 或 medium confidence。`;
    case "invalid primaryKpCode":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。primaryKpCode 不在允许的知识点代码清单中，请只改 metadata 字段，换成输入目录里存在的合法叶子知识点代码。`;
      }
      return `${questionLabel}：primaryKpCode 不在允许的知识点代码清单中。请改成输入目录里存在的合法叶子知识点代码。`;
    case "invalid auxiliaryKpCodes":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。auxiliaryKpCodes 中包含非法代码，请只调整 auxiliaryKpCodes，删除无效代码并保留合法知识点代码。`;
      }
      return `${questionLabel}：auxiliaryKpCodes 中包含非法代码。请删除无效代码，只保留输入目录里存在的合法知识点代码。`;
    case "primaryKpCode repeated in auxiliaryKpCodes":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。primaryKpCode 被重复放进 auxiliaryKpCodes，请从 auxiliaryKpCodes 中移除该重复项。`;
      }
      return `${questionLabel}：primaryKpCode 被重复放进 auxiliaryKpCodes。请从 auxiliaryKpCodes 中移除该重复项。`;
    case "questionType changed":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。不要擅自修改 questionType；除非输入题型本身明显错误且你能明确证明，否则请保持与输入一致。`;
      }
      return `${questionLabel}：不要擅自修改 questionType。除非输入题型本身明显错误且你能明确证明，否则请保持与输入一致。`;
    case "stem needs manual check":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。只有当题面确实缺失、截断或与选项冲突时才保留 stemStatus=manual_check；否则改回 ok，并保持 explanation 不变。`;
      }
      return `${questionLabel}：题面被标记为 manual_check。只有当题面确实缺失、截断或与选项冲突时才保留 manual_check；否则请改回 ok。`;
    case "code needs manual check":
      if (metadataOnly) {
        return `${questionLabel}：这是 metadata-only 复核。只有当代码确实缺失、截断或与题意冲突时才保留 codeStatus=manual_check；否则改回 ok，并保持 explanation 不变。`;
      }
      return `${questionLabel}：代码被标记为 manual_check。只有当代码确实缺失、截断或与题意冲突时才保留 manual_check；否则请改回 ok。`;
    case "missing explanation":
      return `${questionLabel}：补全 explanation，不能为空，并且要写成可自洽的中文推导式解析。`;
    case "subExplanations length mismatch":
      return `${questionLabel}：subExplanations 数量与子题数量不一致。请为每个子题各返回一条解释。`;
    case "subExplanations contains blank item":
      return `${questionLabel}：subExplanations 中存在空白项。请为每个子题补全非空解释。`;
    case "blankExplanations length mismatch":
      return `${questionLabel}：blankExplanations 数量与空位数量不一致。请为每个空位各返回一条解释。`;
    case "blankExplanations contains blank item":
      return `${questionLabel}：blankExplanations 中存在空白项。请为每个空位补全非空解释。`;
    default:
      return buildGenericReviewReasonItem(questionLabel, kind, reason, options);
  }
}

function buildGenericReviewReasonItem(
  questionLabel: string,
  kind: string,
  reason: string,
  options: ReviewContinuationPromptOptions,
): string {
  if (options.metadataOnly) {
    if (kind === "skipped") {
      return `${questionLabel}：这是 metadata-only 复核，上一轮结果被判为 skipped，原因：${reason}。请只修正 metadata 与状态字段，并保持 explanation 不变。`;
    }

    return `${questionLabel}：这是 metadata-only 复核，上一轮结果触发 warning，原因：${reason}。请优先修正 metadata 与状态字段，只有确有缺失或截断时才保留 manual_check。`;
  }

  if (kind === "skipped") {
    return `${questionLabel}：上一轮结果被判为 skipped，原因：${reason}。请修正 metadata 或 explanation，使其通过自动审校。`;
  }

  return `${questionLabel}：上一轮结果触发 warning，原因：${reason}。如果可以明确判断，就改成可通过的值；只有确有缺失或截断时才保留 manual_check。`;
}

export function buildRewriteContinuationPrompt(
  error: unknown,
  options: RewriteContinuationPromptOptions = {},
): string {
  const parsed = buildRewriteItems(getErrorMessage(error), options);
  return formatPrompt({
    intro: "上一轮输出已收到，但未通过自动校验。",
    category: parsed.category,
    items: parsed.items,
    rules: [
      "必须返回完整的 questions JSON，题目顺序与数量保持不变。",
      "未报错题目的内容不要删除或弱化；报错题目按题型补全 explanation、subExplanations 或 blankExplanations。",
      "只输出 JSON，不要解释错误，不要输出 Markdown，不要回显输入字段。",
    ],
  });
}

export function buildReviewContinuationPrompt(
  error: unknown,
  options: ReviewContinuationPromptOptions = {},
): string {
  const parsed = buildReviewItems(getErrorMessage(error), options);
  return formatPrompt({
    intro: "上一轮输出已收到，但未通过自动审校。",
    category: parsed.category,
    items: parsed.items,
    rules: [
      "必须返回完整的 questions JSON，题目顺序与数量保持不变。",
      "每题都要保留完整的审校字段：questionType、difficulty、primaryKpCode、auxiliaryKpCodes、confidence、stemStatus、codeStatus。",
      options.metadataOnly
        ? "metadata-only 轮次不要改写 explanation、subExplanations、blankExplanations；只修正 metadata 与状态字段。"
        : "full review 轮次需要同时修正 metadata 和 explanation 类字段。",
      "只输出 JSON，不要解释错误，不要输出 Markdown。",
    ],
  });
}
