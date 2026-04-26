import { isBlank, type PaperData, type PaperQuestion } from "./paperFiles.js";

export interface RewriteQuestionContent {
  explanation?: string;
  subExplanations?: string[];
  blankExplanations?: string[];
}

export interface RewriteChunkContent {
  questions: RewriteQuestionContent[];
}

export function applyChunkRewrite(
  paper: PaperData,
  startIndex: number,
  chunk: PaperQuestion[],
  rewritten: RewriteChunkContent,
) {
  if (rewritten.questions.length !== chunk.length) {
    throw new Error(
      `Chunk response length mismatch: expected ${chunk.length}, got ${rewritten.questions.length}`,
    );
  }

  for (let offset = 0; offset < chunk.length; offset++) {
    const question = paper.questions[startIndex + offset];
    const generated = rewritten.questions[offset];
    if (!question || !generated) {
      throw new Error(`Missing question data at offset ${offset}`);
    }

    if (question.questionType === "single_choice") {
      if (isBlank(generated.explanation)) {
        throw new Error(`Missing explanation for Q${startIndex + offset + 1}`);
      }
      question.explanation = generated.explanation!.trim();
      continue;
    }

    if (question.questionType === "reading_program") {
      if (question.subQuestions?.length) {
        let subExplanations = generated.subExplanations;
        if (
          (!subExplanations || subExplanations.length !== question.subQuestions.length) &&
          question.subQuestions.length === 1
        ) {
          const merged = [...(generated.subExplanations ?? []), generated.explanation ?? ""].filter(
            (entry) => !isBlank(entry),
          );
          if (merged.length > 0) {
            subExplanations = [merged.join("\n\n").trim()];
          }
        }

        if (!subExplanations || subExplanations.length !== question.subQuestions.length) {
          throw new Error(`Sub-question explanation mismatch for Q${startIndex + offset + 1}`);
        }

        question.subQuestions.forEach((entry, subIndex) => {
          const explanation = subExplanations?.[subIndex];
          if (isBlank(explanation)) {
            throw new Error(
              `Missing reading explanation for Q${startIndex + offset + 1}.${subIndex + 1}`,
            );
          }
          entry.explanation = explanation!.trim();
        });
        continue;
      }

      const standaloneExplanation = !isBlank(generated.explanation)
        ? generated.explanation
        : generated.subExplanations?.filter((entry) => !isBlank(entry)).join("\n\n");

      if (isBlank(standaloneExplanation)) {
        throw new Error(`Missing reading explanation for Q${startIndex + offset + 1}`);
      }
      question.explanation = standaloneExplanation!.trim();
      continue;
    }

    if (question.blanks?.length) {
      let blankExplanations = generated.blankExplanations;
      if (
        (!blankExplanations || blankExplanations.length !== question.blanks.length) &&
        question.blanks.length === 1
      ) {
        const merged = [...(generated.blankExplanations ?? []), generated.explanation ?? ""].filter(
          (entry) => !isBlank(entry),
        );
        if (merged.length > 0) {
          blankExplanations = [merged.join("\n\n").trim()];
        }
      }

      if (!blankExplanations || blankExplanations.length !== question.blanks.length) {
        throw new Error(`Blank explanation mismatch for Q${startIndex + offset + 1}`);
      }

      question.blanks.forEach((entry, blankIndex) => {
        const explanation = blankExplanations?.[blankIndex];
        if (isBlank(explanation)) {
          throw new Error(
            `Missing completion explanation for Q${startIndex + offset + 1}.${blankIndex + 1}`,
          );
        }
        entry.explanation = explanation!.trim();
      });
      continue;
    }

    if (isBlank(generated.explanation)) {
      throw new Error(`Missing completion explanation for Q${startIndex + offset + 1}`);
    }
    question.explanation = generated.explanation!.trim();
  }
}

export function validateChunkRewrite(params: {
  paper: PaperData;
  startIndex: number;
  chunk: PaperQuestion[];
  rewritten: RewriteChunkContent;
}) {
  const clonedPaper = structuredClone(params.paper);
  applyChunkRewrite(clonedPaper, params.startIndex, params.chunk, params.rewritten);
}
