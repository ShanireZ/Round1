import assert from "node:assert/strict";

import { createPaperAuditFilter, matchesPaperAuditFilter } from "../auditRealPapers.js";
import { listPaperFiles, loadPaper } from "../lib/paperFiles.js";

function getPaper(key: string) {
  const info = listPaperFiles().find((entry) => `${entry.outDir}/${entry.fileName}` === key);
  assert.ok(info, `missing paper file ${key}`);
  return { info, paper: loadPaper(info.filePath) };
}

const cspJ2021 = getPaper("csp-j/2021.json");
const cspS2021 = getPaper("csp-s/2021.json");
const gesp2023 = getPaper("gesp/level-1-202303.json");

{
  const filter = createPaperAuditFilter({ dir: "csp-j" });
  assert.ok(matchesPaperAuditFilter(cspJ2021.info, cspJ2021.paper, filter));
  assert.ok(!matchesPaperAuditFilter(cspS2021.info, cspS2021.paper, filter));
}

{
  const filter = createPaperAuditFilter({ year: "2021" });
  assert.ok(matchesPaperAuditFilter(cspJ2021.info, cspJ2021.paper, filter));
  assert.ok(matchesPaperAuditFilter(cspS2021.info, cspS2021.paper, filter));
  assert.ok(!matchesPaperAuditFilter(gesp2023.info, gesp2023.paper, filter));
}

{
  const filter = createPaperAuditFilter({ dir: "csp-j, gesp", year: "2021, 2023" });
  assert.ok(matchesPaperAuditFilter(cspJ2021.info, cspJ2021.paper, filter));
  assert.ok(matchesPaperAuditFilter(gesp2023.info, gesp2023.paper, filter));
  assert.ok(!matchesPaperAuditFilter(cspS2021.info, cspS2021.paper, filter));
}

console.log("auditRealPapersFilters: ok");
