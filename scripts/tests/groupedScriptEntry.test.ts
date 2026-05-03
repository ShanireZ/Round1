import assert from "node:assert/strict";

import { resolveCommand } from "../lib/stableScriptEntry.js";
import { collectCommands } from "../collect.js";
import { ingestCommands } from "../ingest.js";
import { reviewCommands } from "../review.js";
import { auditCommands } from "../audit.js";
import { maintenanceCommands } from "../maintenance.js";

assert.equal(
  resolveCommand(collectCommands, "scrape-luogu").scriptPath,
  "commands/collect/scrapeLuogu.ts",
);
assert.equal(
  resolveCommand(ingestCommands, "ingest-real-papers").scriptPath,
  "commands/ingest/ingestRealPapers.ts",
);
assert.equal(
  resolveCommand(reviewCommands, "review-real-papers").scriptPath,
  "commands/review/reviewRealPapers.ts",
);
assert.equal(
  resolveCommand(auditCommands, "audit-real-papers").scriptPath,
  "commands/audit/auditRealPapers.ts",
);
assert.equal(
  resolveCommand(maintenanceCommands, "migrate").scriptPath,
  "commands/maintenance/migrate.ts",
);

assert.throws(
  () => resolveCommand(auditCommands, "unknown-audit-command"),
  /Unknown command: unknown-audit-command[\s\S]*audit-real-papers[\s\S]*verify-ui-tokens/,
);

console.log("groupedScriptEntry: ok");
