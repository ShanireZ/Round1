import { describe, expect, it } from "vitest";

import {
  buildExamNewOptions,
  formatDraftTtlLabel,
  formatExamTypeDescription,
  formatExamTypeLabel,
  getAvailableExamCount,
  normalizeExamDifficulties,
  resolveDefaultExamSelection,
  resolveDifficultyForExamType,
} from "./exam-new";

describe("exam new helpers", () => {
  const options = buildExamNewOptions({
    examTypes: ["CSP-J", "CSP-S"],
    difficulties: ["medium", "hard", "legacy", "easy"],
    catalogItems: [
      { examType: "CSP-J", difficulty: "medium", count: 2 },
      { examType: "CSP-S", difficulty: "hard", count: 1 },
    ],
  });

  it("builds a config-driven option matrix without accepting unknown difficulties", () => {
    expect(normalizeExamDifficulties(["hard", "legacy", "easy"])).toEqual(["easy", "hard"]);
    expect(options).toEqual([
      { examType: "CSP-J", difficulty: "easy", availableCount: 0 },
      { examType: "CSP-J", difficulty: "medium", availableCount: 2 },
      { examType: "CSP-J", difficulty: "hard", availableCount: 0 },
      { examType: "CSP-S", difficulty: "easy", availableCount: 0 },
      { examType: "CSP-S", difficulty: "medium", availableCount: 0 },
      { examType: "CSP-S", difficulty: "hard", availableCount: 1 },
    ]);
  });

  it("resolves available defaults and per-type difficulties", () => {
    expect(resolveDefaultExamSelection(options)).toEqual({
      examType: "CSP-J",
      difficulty: "medium",
      availableCount: 2,
    });
    expect(resolveDifficultyForExamType(options, "CSP-S", "medium")).toBe("hard");
    expect(resolveDifficultyForExamType(options, "CSP-J", "easy")).toBe("medium");
    expect(
      getAvailableExamCount(options, {
        examType: "CSP-S",
        difficulty: "hard",
      }),
    ).toBe(1);
  });

  it("formats display labels while keeping unknown catalog values visible", () => {
    expect(formatExamTypeLabel("GESP-5")).toBe("GESP 5");
    expect(formatExamTypeLabel("NOI")).toBe("NOI");
    expect(formatExamTypeDescription("NOI")).toContain("预制卷目录");
    expect(formatDraftTtlLabel(1440)).toBe("1 天");
    expect(formatDraftTtlLabel(120)).toBe("2 小时");
    expect(formatDraftTtlLabel(45)).toBe("45 分钟");
  });
});
