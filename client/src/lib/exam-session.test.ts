import { describe, expect, it } from "vitest";

import {
  buildRenderableQuestion,
  formatRemainingTime,
  getDraftAnswerValue,
  getSessionCountdownState,
  normalizeDraftAnswers,
  shouldBlockBeforeUnload,
  upsertDraftAnswer,
} from "./exam-session";

describe("exam session helpers", () => {
  it("builds a single choice question with stable option values", () => {
    const result = buildRenderableQuestion("single_choice", {
      stem: "中国的国家顶级域名是（）",
      options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
    });

    expect(result.prompt).toBe("中国的国家顶级域名是（）");
    expect(result.parts).toEqual([
      {
        key: "0",
        prompt: "请选择答案",
        inputMode: "choice",
        options: [
          { value: "A", label: ".cn" },
          { value: "B", label: ".ch" },
          { value: "C", label: ".chn" },
          { value: "D", label: ".china" },
        ],
      },
    ]);
  });

  it("builds reading and completion questions into addressable sub-parts", () => {
    const reading = buildRenderableQuestion("reading_program", {
      stem: "阅读程序",
      cppCode: "int x = 1;",
      subQuestions: [
        {
          stem: "第一问",
          options: ["A. 1", "B. 2"],
        },
      ],
    });

    const completion = buildRenderableQuestion("completion_program", {
      stem: "完善程序",
      fullCode: "res[x][y] = ①;",
      blanks: [
        {
          id: "1",
          options: ["A. `n%2`", "B. `0`", "C. `t`", "D. `1`"],
        },
      ],
    });

    expect(reading.code).toBe("int x = 1;");
    expect(reading.parts[0]).toEqual({
      key: "1",
      prompt: "第一问",
      inputMode: "choice",
      options: [
        { value: "A", label: "1" },
        { value: "B", label: "2" },
      ],
    });

    expect(completion.code).toBe("res[x][y] = ①;");
    expect(completion.parts[0]).toEqual({
      key: "1",
      prompt: "第 1 空",
      inputMode: "choice",
      options: [
        { value: "A", label: "`n%2`" },
        { value: "B", label: "`0`" },
        { value: "C", label: "`t`" },
        { value: "D", label: "`1`" },
      ],
    });
  });

  it("normalizes draft answers and reads back saved values", () => {
    const answers = normalizeDraftAnswers({
      "1": {
        subAnswers: { "0": "B" },
        updatedAt: "2026-04-26T00:30:00.000Z",
      },
      "16": {
        subAnswers: { "1": "A", "2": "C" },
      },
    });

    expect(getDraftAnswerValue(answers, 1, "0")).toBe("B");
    expect(getDraftAnswerValue(answers, 16, "2")).toBe("C");
    expect(getDraftAnswerValue(answers, 16, "3")).toBe("");
  });

  it("writes and clears draft answers using slot/sub-question keys", () => {
    const seeded = normalizeDraftAnswers({});
    const updated = upsertDraftAnswer(seeded, {
      slotNo: 19,
      subKey: "2",
      value: "D",
      updatedAt: "2026-04-26T00:31:00.000Z",
    });
    const cleared = upsertDraftAnswer(updated, {
      slotNo: 19,
      subKey: "2",
      value: "",
      updatedAt: "2026-04-26T00:32:00.000Z",
    });

    expect(updated).toEqual({
      "19": {
        subAnswers: { "2": "D" },
        updatedAt: "2026-04-26T00:31:00.000Z",
      },
    });
    expect(cleared).toEqual({});
  });

  it("derives countdown state and warning levels from the submit deadline", () => {
    expect(formatRemainingTime(90 * 60 * 1000)).toBe("01:30:00");

    expect(
      getSessionCountdownState({
        submitAt: "2026-04-26T02:00:00.000Z",
        now: new Date("2026-04-26T00:30:00.000Z").getTime(),
      }),
    ).toEqual({
      remainingMs: 90 * 60 * 1000,
      label: "01:30:00",
      warningLevel: "normal",
      isExpired: false,
    });

    expect(
      getSessionCountdownState({
        submitAt: "2026-04-26T00:39:30.000Z",
        now: new Date("2026-04-26T00:30:00.000Z").getTime(),
      }).warningLevel,
    ).toBe("warning");

    expect(
      getSessionCountdownState({
        submitAt: "2026-04-26T00:30:45.000Z",
        now: new Date("2026-04-26T00:30:00.000Z").getTime(),
      }).warningLevel,
    ).toBe("critical");

    expect(
      getSessionCountdownState({
        submitAt: "2026-04-26T00:29:50.000Z",
        now: new Date("2026-04-26T00:30:00.000Z").getTime(),
      }),
    ).toEqual({
      remainingMs: 0,
      label: "00:00:00",
      warningLevel: "expired",
      isExpired: true,
    });
  });

  it("only blocks beforeunload while autosaving or when local answers are not persisted", () => {
    const persisted = normalizeDraftAnswers({
      "1": {
        subAnswers: { "0": "B" },
        updatedAt: "2026-04-26T00:30:00.000Z",
      },
    });

    expect(
      shouldBlockBeforeUnload({
        autosavePhase: "saved",
        answers: persisted,
        lastSavedSnapshot: JSON.stringify(persisted),
      }),
    ).toBe(false);

    expect(
      shouldBlockBeforeUnload({
        autosavePhase: "saving",
        answers: persisted,
        lastSavedSnapshot: JSON.stringify(persisted),
      }),
    ).toBe(true);

    expect(
      shouldBlockBeforeUnload({
        autosavePhase: "dirty",
        answers: upsertDraftAnswer(persisted, {
          slotNo: 1,
          subKey: "0",
          value: "C",
          updatedAt: "2026-04-26T00:31:00.000Z",
        }),
        lastSavedSnapshot: JSON.stringify(persisted),
      }),
    ).toBe(true);
  });
});
