import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE_DIR = "docs";
const DEFAULT_OUT_DIR = "count/other-inventories/docs";

const usage = `Usage: npx tsx scripts/commands/audit/reportDocsInventory.ts [--source-dir docs] [--out-dir count/other-inventories/docs] [--write] [--strict]`;

interface Args {
  sourceDir: string;
  outDir: string;
  write: boolean;
  strict: boolean;
}

interface DocsInventoryEntry {
  path: string;
  section: "root" | "plans" | "other";
  title: string;
  date: string | null;
  status: string | null;
  openTasks: number;
  closedTasks: number;
  hasIssueTable: boolean;
  hasVerificationSection: boolean;
  hasMaintenanceSection: boolean;
}

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  return {
    sourceDir: readArg(argv, "--source-dir") ?? DEFAULT_SOURCE_DIR,
    outDir: readArg(argv, "--out-dir") ?? DEFAULT_OUT_DIR,
    write: argv.includes("--write"),
    strict: argv.includes("--strict"),
  };
}

function repoPath(filePath: string) {
  return path
    .relative(process.cwd(), path.resolve(process.cwd(), filePath))
    .replaceAll(path.sep, "/");
}

function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.resolve(entryPath));
    }
  }

  return files.sort((left, right) => repoPath(left).localeCompare(repoPath(right)));
}

function sectionOf(repoFilePath: string): DocsInventoryEntry["section"] {
  if (repoFilePath.startsWith("docs/plans/")) {
    return "plans";
  }
  if (path.dirname(repoFilePath) === "docs") {
    return "root";
  }
  return "other";
}

function extractStatus(lines: string[]) {
  for (const line of lines.slice(0, 20)) {
    const match = /^(?:- )?(?:Status|状态)\s*[:：]\s*(.+)$/i.exec(line.trim());
    if (match) {
      return match[1]!.trim();
    }
  }
  return null;
}

function extractTitle(lines: string[], repoFilePath: string) {
  const heading = lines.find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim() || path.basename(repoFilePath, ".md");
}

async function inspectMarkdownFile(filePath: string): Promise<DocsInventoryEntry> {
  const repoFilePath = repoPath(filePath);
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const title = extractTitle(lines, repoFilePath);
  const dateMatch = /^docs\/plans\/(\d{4}-\d{2}-\d{2})-/.exec(repoFilePath);

  return {
    path: repoFilePath,
    section: sectionOf(repoFilePath),
    title,
    date: dateMatch?.[1] ?? null,
    status: extractStatus(lines),
    openTasks: (content.match(/^\s*-\s+\[\s\]/gm) ?? []).length,
    closedTasks: (content.match(/^\s*-\s+\[[xX]\]/gm) ?? []).length,
    hasIssueTable: /\|\s*(?:id|ID|问题|issue)\s*\|/i.test(content),
    hasVerificationSection: /^##\s+(?:Verification|验证|验收)/im.test(content),
    hasMaintenanceSection: /^##\s+(?:Maintenance|维护|清理|归档)/im.test(content),
  };
}

function renderMarkdown(params: {
  generatedAt: string;
  sourceDir: string;
  entries: DocsInventoryEntry[];
}) {
  const missingStatus = params.entries.filter((entry) => entry.status === null);
  const plans = params.entries.filter((entry) => entry.section === "plans");
  const rootDocs = params.entries.filter((entry) => entry.section === "root");
  const openTaskFiles = params.entries.filter((entry) => entry.openTasks > 0);
  const totalOpenTasks = params.entries.reduce((sum, entry) => sum + entry.openTasks, 0);

  const lines = [
    "# Docs Inventory",
    "",
    `- Generated at: ${params.generatedAt}`,
    `- Source dir: ${params.sourceDir}`,
    `- Markdown files: ${params.entries.length}`,
    `- Root docs: ${rootDocs.length}`,
    `- Plan docs: ${plans.length}`,
    `- Files without status header: ${missingStatus.length}`,
    `- Files with open tasks: ${openTaskFiles.length}`,
    `- Open task markers: ${totalOpenTasks}`,
    "",
    "## Files",
    "",
    "| path | section | status | open tasks | title |",
    "| --- | --- | --- | ---: | --- |",
  ];

  for (const entry of params.entries) {
    lines.push(
      `| ${entry.path} | ${entry.section} | ${entry.status ?? "missing"} | ${entry.openTasks} | ${entry.title.replace(/\|/g, "\\|")} |`,
    );
  }

  if (missingStatus.length > 0) {
    lines.push("", "## Missing Status Headers", "");
    for (const entry of missingStatus) {
      lines.push(`- ${entry.path}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(process.cwd(), args.sourceDir);
  const generatedAt = new Date().toISOString();
  const entries = await Promise.all(listMarkdownFiles(sourceDir).map(inspectMarkdownFile));
  const payload = {
    generatedAt,
    sourceDir: repoPath(sourceDir),
    summary: {
      markdownFiles: entries.length,
      rootDocs: entries.filter((entry) => entry.section === "root").length,
      planDocs: entries.filter((entry) => entry.section === "plans").length,
      filesWithoutStatusHeader: entries.filter((entry) => entry.status === null).length,
      filesWithOpenTasks: entries.filter((entry) => entry.openTasks > 0).length,
      openTaskMarkers: entries.reduce((sum, entry) => sum + entry.openTasks, 0),
    },
    entries,
  };
  const markdown = renderMarkdown({ generatedAt, sourceDir: repoPath(sourceDir), entries });
  console.log(markdown);

  if (args.write) {
    const outDir = path.resolve(process.cwd(), args.outDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, "docs-inventory.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    await writeFile(path.join(outDir, "docs-inventory.md"), markdown);
    console.log(`Inventory written to ${repoPath(outDir)}`);
  }

  if (args.strict && payload.summary.filesWithoutStatusHeader > 0) {
    throw new Error(
      `Docs inventory strict check failed: ${payload.summary.filesWithoutStatusHeader} file(s) lack a status header`,
    );
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  });
}
