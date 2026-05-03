import {
  answerOptionText,
  isBlank,
  listPaperFiles,
  loadPaper,
  savePaper,
} from "../../lib/paperFiles.js";

const PENDING_EXPLANATION = "当前缺少可确认的标准答案，待官方来源补齐后再补详细解析。";

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
    } else {
      args[key] = next;
      index++;
    }
  }

  return args;
}

function buildSingleChoiceExplanation(
  answer: string | undefined,
  options: string[] | undefined,
  stem: string,
): string {
  const optionText = answerOptionText(options, answer);
  const negativeStem = /(不正确|不能|错误|不属于|不可以|不符合)/.test(stem);
  const lead = answer ? `正确答案为 ${answer}。` : "根据题意可以确定唯一正确选项。";
  const choice = optionText ? `选项${answer}“${optionText}”` : `选项${answer ?? "对应项"}`;
  const reason = negativeStem ? `${choice}是题干要求找出的不符合项。` : `${choice}与题干条件一致。`;
  return `${lead}${reason}`;
}

function buildReadingExplanation(
  answer: string | undefined,
  options: string[] | undefined,
  index: number,
): string {
  const optionText = answerOptionText(options, answer);
  return optionText
    ? `根据程序执行过程与变量变化分析，第${index + 1}问应选 ${answer}，对应“${optionText}”。`
    : `根据程序执行过程与变量变化分析，第${index + 1}问答案为 ${answer ?? "该项"}。`;
}

function buildBlankExplanation(
  answer: string | undefined,
  options: string[] | undefined,
  index: number,
): string {
  const optionText = answerOptionText(options, answer);
  return optionText
    ? `第${index + 1}空应选 ${answer}，即“${optionText}”，这样程序的语法与逻辑才能满足题意。`
    : `第${index + 1}空应填 ${answer ?? "对应选项"}，这样程序的语法与逻辑才能满足题意。`;
}

function buildExplanationOrPending(answer: string | undefined, build: () => string): string {
  return isBlank(answer) ? PENDING_EXPLANATION : build();
}

function backfillPaper(filePath: string, write: boolean): { updated: number } {
  const paper = loadPaper(filePath);
  let updated = 0;

  for (const question of paper.questions) {
    if (question.questionType === "single_choice" && isBlank(question.explanation)) {
      question.explanation = buildExplanationOrPending(question.answer, () =>
        buildSingleChoiceExplanation(question.answer, question.options, question.stem),
      );
      updated++;
      continue;
    }

    if (question.questionType === "reading_program") {
      if (question.subQuestions?.length) {
        question.subQuestions.forEach((entry, index) => {
          if (isBlank(entry.explanation)) {
            entry.explanation = buildExplanationOrPending(entry.answer, () =>
              buildReadingExplanation(entry.answer, entry.options, index),
            );
            updated++;
          }
        });
      } else if (isBlank(question.explanation)) {
        question.explanation = buildExplanationOrPending(question.answer, () =>
          buildReadingExplanation(question.answer, question.options, 0),
        );
        updated++;
      }
      continue;
    }

    if (question.questionType === "completion_program") {
      if (question.blanks?.length) {
        question.blanks.forEach((entry, index) => {
          if (isBlank(entry.explanation)) {
            entry.explanation = buildExplanationOrPending(entry.answer, () =>
              buildBlankExplanation(entry.answer, entry.options, index),
            );
            updated++;
          }
        });
      } else if (isBlank(question.explanation)) {
        question.explanation = buildExplanationOrPending(question.answer, () =>
          buildBlankExplanation(question.answer, question.options, 0),
        );
        updated++;
      }
    }
  }

  if (write && updated > 0) {
    savePaper(filePath, paper);
  }

  return { updated };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const write = args.write === true;
  let totalUpdated = 0;

  for (const info of listPaperFiles()) {
    const result = backfillPaper(info.filePath, write);
    totalUpdated += result.updated;
    console.log(
      `${write ? "WRITE" : "DRY"} ${info.outDir}/${info.fileName}: explanations=${result.updated}`,
    );
  }

  console.log(`BACKFILL-SUMMARY updated=${totalUpdated} write=${write}`);
}

main();
