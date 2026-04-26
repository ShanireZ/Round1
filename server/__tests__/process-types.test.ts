import { describe, expect, it } from "vitest";

import {
  ROUND1_PROCESS_TYPES,
  isRound1WorkerProcessType,
  resolveRound1DbApplicationName,
} from "../../config/processTypes.js";

describe("config/processTypes", () => {
  it("does not keep the legacy bare worker alias", () => {
    expect("LEGACY_WORKER" in ROUND1_PROCESS_TYPES).toBe(false);
    expect(isRound1WorkerProcessType("worker")).toBe(false);
    expect(resolveRound1DbApplicationName("worker")).toBe("round1-api");
  });
});
