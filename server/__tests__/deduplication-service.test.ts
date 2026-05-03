import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn((left, right) => ({ op: "eq", left, right }));
const neMock = vi.fn((left, right) => ({ op: "ne", left, right }));
const andMock = vi.fn((...conditions) => ({ op: "and", conditions }));

const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

const infoMock = vi.fn();

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();

  return {
    ...actual,
    eq: eqMock,
    ne: neMock,
    and: andMock,
  };
});

vi.mock("../db.js", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: infoMock,
  },
}));

describe("server/services/deduplicationService", () => {
  beforeEach(() => {
    vi.resetModules();
    eqMock.mockClear();
    neMock.mockClear();
    andMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
    whereMock.mockReset();
    infoMock.mockClear();
  });

  it("does not depend on legacy rejected question status when scanning Jaccard candidates", async () => {
    whereMock.mockResolvedValue([
      {
        id: "question-1",
        contentJson: { stem: "1+1=?" },
      },
    ]);

    const { findJaccardDuplicate } = await import("../services/deduplicationService.js");

    const result = await findJaccardDuplicate({
      contentJson: { stem: "1+1=?" },
      questionType: "single_choice",
      primaryKpId: 101,
    });

    expect(result).toBe("question-1");
    expect(neMock).not.toHaveBeenCalled();
  });

  it("does not treat parameterized queue templates as fuzzy duplicates", async () => {
    const makeQueueContent = (offset: number) => ({
      cppCode: `
#include <bits/stdc++.h>
using namespace std;
int main() {
  int n;
  cin >> n;
  queue<int> q;
  for (int i = 1; i <= n; ++i) q.push(i + ${offset});
  if (n % 2 == 0) q.pop();
  cout << q.front() << " " << q.size() << '\\n';
  return 0;
}
`,
      subQuestions: [
        {
          stem: "What is printed when n is 5?",
          options: ["A. 5 5", "B. 6 5", "C. 7 4", "D. 8 4"],
        },
      ],
      sampleInputs: ["5\n"],
      expectedOutputs: [`${1 + offset} 5\n`],
    });

    whereMock.mockResolvedValue([
      {
        id: "queue-template-1",
        contentJson: makeQueueContent(2),
      },
    ]);

    const { findJaccardDuplicate } = await import("../services/deduplicationService.js");

    const result = await findJaccardDuplicate({
      contentJson: makeQueueContent(5),
      questionType: "reading_program",
      primaryKpId: 101,
    });

    expect(result).toBeNull();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
