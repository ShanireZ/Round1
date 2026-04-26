import { writeFile } from "node:fs/promises";

import {
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
} from "./lib/bundleTypes.js";
import {
  loadPrebuiltPaperBundle,
  validatePrebuiltPaperBundle,
} from "./lib/prebuiltPaperBundleWorkflow.js";

function printHelp() {
  console.log(`Usage: tsx scripts/validatePrebuiltPaperBundle.ts <bundle-path> [options]

Validate a prebuilt paper bundle JSON file against the offline bundle contract.

Options:
  --write-metadata  Persist validation metadata and item checksum manifest when validation passes
  --help            Show this help message
`);
}

async function main() {
  const [bundlePath, ...rest] = process.argv.slice(2);

  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    printHelp();
    return;
  }

  let writeMetadata = false;

  for (const token of rest) {
    if (token === "--write-metadata") {
      writeMetadata = true;
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  const loaded = await loadPrebuiltPaperBundle(bundlePath);
  const result = await validatePrebuiltPaperBundle(loaded);

  let updatedChecksum: string | undefined;
  if (writeMetadata && result.errors.length === 0) {
    loaded.bundle.meta.validation = buildValidationMetadata({
      dbChecksSkipped: result.dbChecksSkipped,
    });
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    const updatedRaw = `${JSON.stringify(loaded.bundle, null, 2)}\n`;
    await writeFile(loaded.sourcePath, updatedRaw, "utf8");
    updatedChecksum = computeChecksum(updatedRaw);
  }

  console.log(
    JSON.stringify(
      {
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        updatedChecksum,
        dbChecksSkipped: result.dbChecksSkipped,
        summary: result.summary,
      },
      null,
      2,
    ),
  );

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
