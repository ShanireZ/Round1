import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertExternalLlmAllowed } from "../lib/externalLlmDisclosure.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "round1-external-llm-consent-"));
const consentPath = path.join(tempDir, "consent.json");
fs.writeFileSync(
  consentPath,
  JSON.stringify(
    {
      schemaVersion: "round1.external-llm-consent/2026-05-03.1",
      approvedBy: "test",
      approvedAt: "2026-05-03T00:00:00.000Z",
      purpose: "regression test",
      allowedProviders: ["provider-a"],
      allowedBaseUrlHosts: ["api.provider-a.test"],
      allowedDataCategories: ["question stems", "answers"],
      acknowledgeQuestionBankTransfer: true,
      acknowledgeNoPolicyBypass: true,
    },
    null,
    2,
  ),
);

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

assert.throws(
  () =>
    assertExternalLlmAllowed({
      allowExternalLlm: true,
      operation: "test workflow",
      dataCategories: ["question stems"],
      plannedProviders: ["provider-a"],
      plannedBaseUrls: ["https://api.provider-a.test/v1"],
    }),
  /missing a consent artifact/,
);

const disclosure = assertExternalLlmAllowed({
  allowExternalLlm: true,
  operation: "test workflow",
  purpose: "regression test",
  dataCategories: ["question stems", "answers"],
  consentPath,
  plannedProviders: ["provider-a"],
  plannedBaseUrls: ["https://api.provider-a.test/v1"],
});

assert.equal(disclosure?.allowed, true);
assert.equal(disclosure?.operation, "test workflow");
assert.equal(disclosure?.purpose, "regression test");
assert.deepEqual(disclosure?.dataCategories, ["question stems", "answers"]);
assert.deepEqual(disclosure?.plannedProviders, ["provider-a"]);
assert.deepEqual(disclosure?.plannedBaseUrlHosts, ["api.provider-a.test"]);
assert.match(disclosure?.acknowledgedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

assert.throws(
  () =>
    assertExternalLlmAllowed({
      allowExternalLlm: true,
      operation: "test workflow",
      dataCategories: ["question stems"],
      consentPath,
      plannedProviders: ["provider-b"],
      plannedBaseUrls: ["https://api.provider-a.test/v1"],
    }),
  /does not allow provider/,
);

console.log("externalLlmDisclosure: ok");
