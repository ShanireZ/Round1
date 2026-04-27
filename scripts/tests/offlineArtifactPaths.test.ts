import assert from "node:assert/strict";
import path from "node:path";

import {
  defaultOfflineReportPath,
  defaultOfflineTmpPath,
  defaultPrebuiltPaperBundleOutputPath,
  defaultQuestionBundleOutputPath,
  formatOfflineRunId,
} from "../lib/paperPaths.js";

function normalized(value: string): string {
  return value.split(path.sep).join("/");
}

const runId = formatOfflineRunId({
  date: new Date("2026-04-27T00:00:00.000Z"),
  pipeline: "step3-llm",
  examType: "CSP-J",
  difficulty: "medium",
  versionNo: 1,
});

assert.equal(runId, "2026-04-27-step3-llm-csp-j-medium-v01");

assert.equal(
  normalized(
    defaultQuestionBundleOutputPath({
      runId,
      questionType: "single_choice",
      kpCode: "BAS",
      count: 12,
      versionNo: 1,
    }),
  ),
  "papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__single-choice__bas__n12__v01.json",
);

assert.equal(
  normalized(
    defaultPrebuiltPaperBundleOutputPath({
      runId,
      blueprintVersion: 1,
      count: 1,
      versionNo: 1,
    }),
  ),
  "artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/2026-04-27-step3-llm-csp-j-medium-v01__prebuilt-paper-bundle__blueprint-v1__n1__v01.json",
);

assert.equal(
  normalized(defaultOfflineReportPath({ runId, reportName: "judge-summary" })),
  "artifacts/reports/2026/2026-04-27-step3-llm-csp-j-medium-v01/2026-04-27-step3-llm-csp-j-medium-v01__report__judge-summary.json",
);

assert.equal(
  normalized(defaultOfflineTmpPath({ runId, artifactName: "probe-1-single" })),
  "artifacts/tmp/2026/2026-04-27-step3-llm-csp-j-medium-v01/2026-04-27-step3-llm-csp-j-medium-v01__tmp__probe-1-single.json",
);

console.log("offlineArtifactPaths: ok");
