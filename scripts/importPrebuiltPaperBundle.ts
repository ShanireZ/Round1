import { parseApplyMode } from "./lib/scriptCli.js";
import {
  importPrebuiltPaperBundle,
  loadPrebuiltPaperBundle,
} from "./lib/prebuiltPaperBundleWorkflow.js";

function printHelp() {
  console.log(`Usage: tsx scripts/importPrebuiltPaperBundle.ts <bundle-path> (--dry-run | --apply)

Options:
  --dry-run   Validate and optionally persist an import batch summary only
  --apply     Import prebuilt papers into the database and record an applied batch
  --help      Show this help message
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const bundlePath = argv[0];

  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    printHelp();
    return;
  }

  const { apply } = parseApplyMode(new Set(argv.slice(1)));

  const loaded = await loadPrebuiltPaperBundle(bundlePath);
  const result = await importPrebuiltPaperBundle(loaded, { apply });

  console.log(
    JSON.stringify(
      {
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        ...result,
      },
      null,
      2,
    ),
  );

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
