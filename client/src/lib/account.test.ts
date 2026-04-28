import { describe, expect, it } from "vitest";

import {
  normalizeClassJoinCode,
  summarizeStudentClasses,
  type StudentClassSummary,
} from "./account";

describe("account helpers", () => {
  it("normalizes class join codes before submit", () => {
    expect(normalizeClassJoinCode(" ab 12 cd ")).toBe("AB12CD");
  });

  it("summarizes joined class progress without counting archived classes as active", () => {
    const classes: StudentClassSummary[] = [
      {
        classId: "class-1",
        name: "CSP-J",
        archivedAt: null,
        joinedVia: "code",
        joinedAt: "2026-04-28T00:00:00.000Z",
        openAssignments: 2,
        completedAssignments: 3,
        missedAssignments: 1,
      },
      {
        classId: "class-2",
        name: "GESP",
        archivedAt: "2026-04-27T00:00:00.000Z",
        joinedVia: "invite_link",
        joinedAt: "2026-04-20T00:00:00.000Z",
        openAssignments: 1,
        completedAssignments: 4,
        missedAssignments: 0,
      },
    ];

    expect(summarizeStudentClasses(classes)).toEqual({
      activeClasses: 1,
      openAssignments: 3,
      completedAssignments: 7,
      missedAssignments: 1,
    });
  });
});
