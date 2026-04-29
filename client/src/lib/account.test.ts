import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteExternalIdentity,
  normalizeClassJoinCode,
  summarizeStudentClasses,
  type StudentClassSummary,
} from "./account";

vi.mock("./auth", () => ({
  getCachedAuthCsrfToken: vi.fn(async () => "csrf-token"),
}));

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

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

  it("requests external identity unlink with CSRF protection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: "已解除绑定" },
      }),
    });

    await expect(deleteExternalIdentity("cpplearn")).resolves.toEqual({ message: "已解除绑定" });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/auth/external/cpplearn");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get("X-CSRF-Token")).toBe("csrf-token");
  });
});
