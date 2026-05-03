import assert from "node:assert/strict";

import { assertExternalLlmAllowed } from "../lib/externalLlmDisclosure.js";

assert.throws(
  () =>
    assertExternalLlmAllowed({
      allowExternalLlm: false,
      operation: "test workflow",
      dataCategories: ["question stems"],
    }),
  /External LLM calls are blocked[\s\S]*--allow-external-llm/,
);

assert.equal(
  assertExternalLlmAllowed({
    allowExternalLlm: false,
    operation: "plan only",
    dataCategories: ["question stems"],
    skipBecauseNoLlmCalls: true,
  }),
  null,
);

const disclosure = assertExternalLlmAllowed({
  allowExternalLlm: true,
  operation: "test workflow",
  purpose: "regression test",
  dataCategories: ["question stems", "answers"],
});

assert.equal(disclosure?.allowed, true);
assert.equal(disclosure?.operation, "test workflow");
assert.equal(disclosure?.purpose, "regression test");
assert.deepEqual(disclosure?.dataCategories, ["question stems", "answers"]);
assert.match(disclosure?.acknowledgedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

console.log("externalLlmDisclosure: ok");
