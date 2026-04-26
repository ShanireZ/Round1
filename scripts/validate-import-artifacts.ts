import { readFile } from "node:fs/promises";

function printHelp() {
  console.log(`Usage: tsx scripts/validate-import-artifacts.ts <bundle-path> [validator options]

Thin dispatcher for offline import artifacts:
  question_bundle         -> validateQuestionBundle.ts
  prebuilt_paper_bundle  -> validatePrebuiltPaperBundle.ts
`);
}

const [bundlePath] = process.argv.slice(2);

if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
  printHelp();
} else {
  const raw = await readFile(bundlePath, "utf8");
  const bundleType = (JSON.parse(raw) as { meta?: { bundleType?: unknown } }).meta?.bundleType;

  if (bundleType === "question_bundle") {
    await import("./validateQuestionBundle.js");
  } else if (bundleType === "prebuilt_paper_bundle") {
    await import("./validatePrebuiltPaperBundle.js");
  } else {
    throw new Error(`Unsupported bundle type: ${String(bundleType)}`);
  }
}
