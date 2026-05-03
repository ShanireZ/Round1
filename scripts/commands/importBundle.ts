import {
  dispatchByBundleType,
  parseApplyMode,
  printJsonOutput,
  renderCliHelp,
} from "../lib/scriptCli.js";
import {
  importPrebuiltPaperBundle,
  loadPrebuiltPaperBundle,
} from "../lib/prebuiltPaperBundleWorkflow.js";
import { importQuestionBundle, loadQuestionBundle } from "../lib/questionBundleWorkflow.js";

function printHelp() {
  console.log(
    renderCliHelp({
      usage: "tsx scripts/commands/importBundle.ts <bundle-path> (--dry-run | --apply)",
      summary:
        "Import a question bundle or prebuilt paper bundle. The command dispatches by meta.bundleType.",
      options: [
        {
          flag: "--dry-run",
          description: "Validate and optionally persist an import batch summary only",
        },
        {
          flag: "--apply",
          description: "Import the bundle into the database and record an applied batch",
        },
        {
          flag: "--help",
          description: "Show this help message",
        },
      ],
    }),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const bundlePath = argv[0];

  if (!bundlePath || bundlePath === "--help" || bundlePath === "-h") {
    printHelp();
    return;
  }

  const flags = new Set(argv.slice(1));
  for (const flag of flags) {
    if (flag !== "--dry-run" && flag !== "--apply") {
      throw new Error(`Unexpected argument: ${flag}`);
    }
  }

  const { apply } = parseApplyMode(flags);

  await dispatchByBundleType({
    bundlePath,
    handlers: {
      question_bundle: async () => {
        const loaded = await loadQuestionBundle(bundlePath);
        const result = await importQuestionBundle(loaded, { apply });
        printJsonOutput({
          sourceFilename: loaded.sourceFilename,
          checksum: loaded.checksum,
          ...result,
        });
        if (result.status === "failed") {
          process.exitCode = 1;
        }
      },
      prebuilt_paper_bundle: async () => {
        const loaded = await loadPrebuiltPaperBundle(bundlePath);
        const result = await importPrebuiltPaperBundle(loaded, { apply });
        printJsonOutput({
          sourceFilename: loaded.sourceFilename,
          checksum: loaded.checksum,
          ...result,
        });
        if (result.status === "failed") {
          process.exitCode = 1;
        }
      },
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
