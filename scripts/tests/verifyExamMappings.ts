import assert from "node:assert/strict";
import { EXAM_MAP } from "../lib/examMappings.js";

const expected: Array<[string, string]> = [
  ["1181", "level-1-202506.json"],
  ["1188", "level-8-202506.json"],
  ["1189", "level-1-202509.json"],
  ["1196", "level-8-202509.json"],
  ["1197", "level-1-202512.json"],
  ["1204", "level-8-202512.json"],
];

for (const [examId, outFile] of expected) {
  assert.ok(EXAM_MAP[examId], `missing mapping for ${examId}`);
  assert.equal(EXAM_MAP[examId].outFile, outFile, `unexpected outFile for ${examId}`);
}

console.log("verifyExamMappings: ok");
