import assert from "node:assert/strict";

import {
  buildReviewContinuationPrompt,
  buildRewriteContinuationPrompt,
} from "../lib/continuationPrompts";

{
  const prompt = buildRewriteContinuationPrompt(new SyntaxError("Unexpected end of JSON input"), {
    questionTypes: ["single_choice", "reading_program", "completion_program"],
  });

  assert.match(prompt, /问题类别：JSON 结构错误/);
  assert.match(prompt, /待修正项：/);
  assert.match(prompt, /补全缺失的 JSON 结构/);
  assert.match(prompt, /single_choice 题只能返回 explanation/);
  assert.match(prompt, /reading_program 题要围绕程序执行过程组织解析/);
  assert.match(prompt, /completion_program 题要说明空位在整体算法中的作用/);
  assert.match(prompt, /完整的 questions JSON/);
  assert.doesNotMatch(prompt, /错误原因：/);
}

{
  const prompt = buildRewriteContinuationPrompt(new Error("Missing explanation for Q3"), {
    questionTypes: ["single_choice"],
  });

  assert.match(prompt, /问题类别：内容校验失败/);
  assert.match(prompt, /Q3：补全 explanation/);
  assert.match(prompt, /这是 single_choice 题；不要返回 subExplanations 或 blankExplanations/);
  assert.match(prompt, /未报错题目的内容不要删除或弱化/);
}

{
  const prompt = buildRewriteContinuationPrompt(
    new Error("Sub-question explanation mismatch for Q5"),
    {
      questionTypes: ["reading_program"],
    },
  );

  assert.match(prompt, /Q5：subExplanations 数量必须与子题数量完全一致/);
  assert.match(prompt, /这是 reading_program 题；如果该题有子题，就只能返回 subExplanations/);
}

{
  const prompt = buildRewriteContinuationPrompt(new Error("Blank explanation mismatch for Q7"), {
    questionTypes: ["completion_program"],
  });

  assert.match(prompt, /Q7：blankExplanations 数量必须与空位数量完全一致/);
  assert.match(prompt, /这是 completion_program 题；如果该题有空位，就只能返回 blankExplanations/);
}

{
  const prompt = buildReviewContinuationPrompt(
    new Error(
      "review requires correction: Q4 skipped: low confidence | Q5 warning: stem needs manual check",
    ),
    { metadataOnly: false },
  );

  assert.match(prompt, /问题类别：审校结果需修正/);
  assert.match(
    prompt,
    /Q4：置信度过低。请重新审校该题，并只在能够明确自证时才给出 high 或 medium confidence/,
  );
  assert.match(
    prompt,
    /Q5：题面被标记为 manual_check。只有当题面确实缺失、截断或与选项冲突时才保留 manual_check；否则请改回 ok/,
  );
  assert.match(prompt, /每题都要保留完整的审校字段/);
  assert.doesNotMatch(prompt, /review requires correction:/);
}

{
  const prompt = buildReviewContinuationPrompt(
    new Error(
      "review requires correction: Q6 skipped: invalid primaryKpCode; invalid auxiliaryKpCodes | Q7 warning: code needs manual check",
    ),
    { metadataOnly: false },
  );

  assert.match(
    prompt,
    /Q6：primaryKpCode 不在允许的知识点代码清单中。请改成输入目录里存在的合法叶子知识点代码/,
  );
  assert.match(
    prompt,
    /Q6：auxiliaryKpCodes 中包含非法代码。请删除无效代码，只保留输入目录里存在的合法知识点代码/,
  );
  assert.match(
    prompt,
    /Q7：代码被标记为 manual_check。只有当代码确实缺失、截断或与题意冲突时才保留 manual_check；否则请改回 ok/,
  );
}

{
  const prompt = buildReviewContinuationPrompt(
    new Error(
      "review requires correction: Q8 skipped: primaryKpCode repeated in auxiliaryKpCodes; questionType changed",
    ),
    { metadataOnly: false },
  );

  assert.match(
    prompt,
    /Q8：primaryKpCode 被重复放进 auxiliaryKpCodes。请从 auxiliaryKpCodes 中移除该重复项/,
  );
  assert.match(
    prompt,
    /Q8：不要擅自修改 questionType。除非输入题型本身明显错误且你能明确证明，否则请保持与输入一致/,
  );
}

{
  const prompt = buildReviewContinuationPrompt(
    new Error(
      "review requires correction: Q9 skipped: low confidence | Q10 warning: stem needs manual check",
    ),
    { metadataOnly: true },
  );

  assert.match(
    prompt,
    /Q9：这是 metadata-only 复核，先修正 questionType、difficulty、知识点和状态字段，再重新评估 confidence；只有能明确自证时才给 high 或 medium/,
  );
  assert.match(
    prompt,
    /Q10：这是 metadata-only 复核。只有当题面确实缺失、截断或与选项冲突时才保留 stemStatus=manual_check；否则改回 ok，并保持 explanation 不变/,
  );
  assert.match(
    prompt,
    /metadata-only 轮次不要改写 explanation、subExplanations、blankExplanations/,
  );
}

{
  const prompt = buildReviewContinuationPrompt(
    new Error("review requires correction: Q11 skipped: missing explanation"),
    { metadataOnly: false },
  );

  assert.match(prompt, /Q11：补全 explanation，不能为空，并且要写成可自洽的中文推导式解析/);
  assert.match(prompt, /full review 轮次需要同时修正 metadata 和 explanation 类字段/);
}

{
  const prompt = buildReviewContinuationPrompt(
    new SyntaxError("Unexpected token ] in JSON at position 17"),
    { metadataOnly: false },
  );

  assert.match(prompt, /问题类别：JSON 结构错误/);
  assert.match(prompt, /确保 JSON 可以直接被解析/);
  assert.match(prompt, /只输出 JSON/);
}

console.log("continuationPrompts: ok");
