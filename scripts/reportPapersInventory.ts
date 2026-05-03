import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  QuestionBundleSchema,
  type QuestionBundleItem,
} from "./lib/bundleTypes.js";

const DEFAULT_SOURCE_DIR = "papers";
const DEFAULT_OUT_DIR = "papers/_inventory";

const usage = `Usage: npx tsx scripts/reportPapersInventory.ts [--source-dir papers] [--out-dir papers/_inventory] [--write]`;

interface Args {
  sourceDir: string;
  outDir: string;
  write: boolean;
}

interface DuplicateLocation {
  section: string;
  file: string;
  itemIndex: number;
}

interface DuplicateGroup {
  contentHash: string;
  count: number;
  locations: DuplicateLocation[];
}

interface GeneratedYearInventory {
  section: string;
  sectionType: "generated-year";
  year: string;
  sourceDir: string;
  generatedAt: string;
  runDirectories: number;
  bundleFiles: number;
  itemCount: number;
  examTaggedRows: number;
  invalidFiles: Array<{ path: string; message: string }>;
  emptyRunDirectories: string[];
  counts: {
    byQuestionType: Record<string, number>;
    byExamType: Record<string, number>;
    byDifficulty: Record<string, number>;
    byPrimaryKpGroup: Record<string, number>;
    bySource: Record<string, number>;
    byExamTypeQuestionTypeDifficultyKpGroup: Record<string, number>;
  };
  duplicateContentHashGroups: DuplicateGroup[];
}

interface RealPaperInventory {
  section: "real-papers";
  sectionType: "real-papers";
  sourceDir: string;
  generatedAt: string;
  filesFound: number;
  questionCount: number;
  subQuestionCount: number;
  invalidFiles: Array<{ path: string; message: string }>;
  counts: {
    byExamType: Record<string, number>;
    byYear: Record<string, number>;
    byQuestionType: Record<string, number>;
    byDifficulty: Record<string, number>;
    byPrimaryKpGroup: Record<string, number>;
    byExamTypeYear: Record<string, number>;
  };
  duplicateContentHashGroups: DuplicateGroup[];
}

type SectionInventory = GeneratedYearInventory | RealPaperInventory;

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
  };
}

function repoPath(filePath: string) {
  return path.relative(process.cwd(), path.resolve(process.cwd(), filePath)).replaceAll(path.sep, "/");
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.resolve(entryPath));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function kpGroupOf(kpCode: string) {
  return kpCode.split("-")[0] ?? kpCode;
}

function computeContentHash(stem: string, codeOrOptions: string) {
  const raw = `${stem}${codeOrOptions}`;
  const normalized = raw
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, "");
  return crypto.createHash("sha256").update(normalized, "utf-8").digest("hex");
}

function duplicateGroups(locationsByHash: Map<string, DuplicateLocation[]>): DuplicateGroup[] {
  return [...locationsByHash.entries()]
    .filter(([_hash, locations]) => locations.length > 1)
    .map(([contentHash, locations]) => ({
      contentHash,
      count: locations.length,
      locations: locations.sort(
        (left, right) =>
          left.section.localeCompare(right.section) ||
          left.file.localeCompare(right.file) ||
          left.itemIndex - right.itemIndex,
      ),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.contentHash.localeCompare(right.contentHash),
    );
}

function addDuplicateLocation(
  locationsByHash: Map<string, DuplicateLocation[]>,
  contentHash: string,
  location: DuplicateLocation,
) {
  const bucket = locationsByHash.get(contentHash);
  if (bucket) {
    bucket.push(location);
  } else {
    locationsByHash.set(contentHash, [location]);
  }
}

function realQuestionHashSource(question: Record<string, unknown>) {
  const options = question.options;
  if (Array.isArray(options)) {
    return options.filter((entry): entry is string => typeof entry === "string").join("");
  }
  if (typeof question.cppCode === "string") {
    return question.cppCode;
  }
  if (typeof question.fullCode === "string") {
    return question.fullCode;
  }
  return "";
}

function countGeneratedItem(
  section: string,
  filePath: string,
  item: QuestionBundleItem,
  itemIndex: number,
  inventory: GeneratedYearInventory,
  locationsByHash: Map<string, DuplicateLocation[]>,
) {
  inventory.itemCount += 1;
  inventory.examTaggedRows += item.examTypes.length;
  increment(inventory.counts.byQuestionType, item.type);
  increment(inventory.counts.byDifficulty, item.difficulty);
  increment(inventory.counts.byPrimaryKpGroup, kpGroupOf(item.primaryKpCode));
  increment(inventory.counts.bySource, item.source);

  for (const examType of item.examTypes) {
    increment(inventory.counts.byExamType, examType);
    increment(
      inventory.counts.byExamTypeQuestionTypeDifficultyKpGroup,
      `${examType}|${item.type}|${item.difficulty}|${kpGroupOf(item.primaryKpCode)}`,
    );
  }

  addDuplicateLocation(locationsByHash, item.contentHash, {
    section,
    file: repoPath(filePath),
    itemIndex,
  });
}

async function inventoryGeneratedYear(yearDir: string, generatedAt: string): Promise<GeneratedYearInventory> {
  const year = path.basename(yearDir);
  const section = year;
  const runDirs = fs.existsSync(yearDir)
    ? fs
        .readdirSync(yearDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
        .map((entry) => path.join(yearDir, entry.name))
        .sort((left, right) => left.localeCompare(right))
    : [];
  const jsonFiles = listJsonFiles(yearDir).filter((file) => !repoPath(file).includes("/_inventory/"));
  const inventory: GeneratedYearInventory = {
    section,
    sectionType: "generated-year",
    year,
    sourceDir: repoPath(yearDir),
    generatedAt,
    runDirectories: runDirs.length,
    bundleFiles: 0,
    itemCount: 0,
    examTaggedRows: 0,
    invalidFiles: [],
    emptyRunDirectories: [],
    counts: {
      byQuestionType: {},
      byExamType: {},
      byDifficulty: {},
      byPrimaryKpGroup: {},
      bySource: {},
      byExamTypeQuestionTypeDifficultyKpGroup: {},
    },
    duplicateContentHashGroups: [],
  };
  const locationsByHash = new Map<string, DuplicateLocation[]>();

  for (const runDir of runDirs) {
    const bundleDir = path.join(runDir, "question-bundles");
    if (!fs.existsSync(bundleDir) || listJsonFiles(bundleDir).length === 0) {
      inventory.emptyRunDirectories.push(repoPath(runDir));
    }
  }

  for (const filePath of jsonFiles) {
    try {
      const parsed = QuestionBundleSchema.safeParse(JSON.parse(await readFile(filePath, "utf8")));
      if (!parsed.success) {
        inventory.invalidFiles.push({
          path: repoPath(filePath),
          message: parsed.error.issues[0]?.message ?? "invalid question bundle",
        });
        continue;
      }
      inventory.bundleFiles += 1;
      parsed.data.items.forEach((item, itemIndex) =>
        countGeneratedItem(section, filePath, item, itemIndex, inventory, locationsByHash),
      );
    } catch (error) {
      inventory.invalidFiles.push({
        path: repoPath(filePath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  inventory.duplicateContentHashGroups = duplicateGroups(locationsByHash);
  return inventory;
}

async function inventoryRealPapers(realPapersDir: string, generatedAt: string): Promise<RealPaperInventory> {
  const inventory: RealPaperInventory = {
    section: "real-papers",
    sectionType: "real-papers",
    sourceDir: repoPath(realPapersDir),
    generatedAt,
    filesFound: 0,
    questionCount: 0,
    subQuestionCount: 0,
    invalidFiles: [],
    counts: {
      byExamType: {},
      byYear: {},
      byQuestionType: {},
      byDifficulty: {},
      byPrimaryKpGroup: {},
      byExamTypeYear: {},
    },
    duplicateContentHashGroups: [],
  };
  const locationsByHash = new Map<string, DuplicateLocation[]>();

  for (const filePath of listJsonFiles(realPapersDir)) {
    inventory.filesFound += 1;
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
      const examType = typeof parsed.examType === "string" ? parsed.examType : "";
      const year = typeof parsed.year === "number" ? String(parsed.year) : "";
      const questions = Array.isArray(parsed.questions) ? parsed.questions : null;
      if (!examType || !year || !questions) {
        inventory.invalidFiles.push({
          path: repoPath(filePath),
          message: "real paper must contain examType, numeric year, and questions[]",
        });
        continue;
      }

      increment(inventory.counts.byExamType, examType);
      increment(inventory.counts.byYear, year);
      increment(inventory.counts.byExamTypeYear, `${examType}|${year}`);

      questions.forEach((question, itemIndex) => {
        const record = typeof question === "object" && question !== null ? (question as Record<string, unknown>) : {};
        const questionType = typeof record.questionType === "string" ? record.questionType : "unknown";
        const difficulty = typeof record.difficulty === "string" ? record.difficulty : "unknown";
        const primaryKpCode = typeof record.primaryKpCode === "string" ? record.primaryKpCode : "unknown";
        const stem = typeof record.stem === "string" ? record.stem : "";
        const subQuestions = Array.isArray(record.subQuestions) ? record.subQuestions.length : 0;
        const blanks = Array.isArray(record.blanks) ? record.blanks.length : 0;

        inventory.questionCount += 1;
        inventory.subQuestionCount += subQuestions + blanks;
        increment(inventory.counts.byQuestionType, questionType);
        increment(inventory.counts.byDifficulty, difficulty);
        increment(inventory.counts.byPrimaryKpGroup, kpGroupOf(primaryKpCode));

        addDuplicateLocation(
          locationsByHash,
          computeContentHash(stem, realQuestionHashSource(record)),
          {
            section: "real-papers",
            file: repoPath(filePath),
            itemIndex,
          },
        );
      });
    } catch (error) {
      inventory.invalidFiles.push({
        path: repoPath(filePath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  inventory.duplicateContentHashGroups = duplicateGroups(locationsByHash);
  return inventory;
}

function renderSectionMarkdown(section: SectionInventory) {
  const lines = [
    `# Papers Inventory: ${section.section}`,
    "",
    `- Generated at: ${section.generatedAt}`,
    `- Source dir: ${section.sourceDir}`,
    `- Section type: ${section.sectionType}`,
  ];

  if (section.sectionType === "generated-year") {
    lines.push(
      `- Run directories: ${section.runDirectories}`,
      `- Bundle files: ${section.bundleFiles}`,
      `- Items: ${section.itemCount}`,
      `- Exam-tagged rows: ${section.examTaggedRows}`,
      `- Invalid files: ${section.invalidFiles.length}`,
      `- Exact duplicate contentHash groups: ${section.duplicateContentHashGroups.length}`,
    );
  } else {
    lines.push(
      `- Files found: ${section.filesFound}`,
      `- Questions: ${section.questionCount}`,
      `- Sub-question/blanks: ${section.subQuestionCount}`,
      `- Invalid files: ${section.invalidFiles.length}`,
      `- Exact duplicate contentHash groups: ${section.duplicateContentHashGroups.length}`,
    );
  }

  lines.push("", "## Counts", "");
  for (const [name, counts] of Object.entries(section.counts)) {
    lines.push(`### ${name}`, "", "| key | count |", "| --- | ---: |");
    for (const [key, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`| ${key} | ${count} |`);
    }
    lines.push("");
  }

  if (section.duplicateContentHashGroups.length > 0) {
    lines.push("## Duplicate Content Hash Groups", "");
    for (const group of section.duplicateContentHashGroups.slice(0, 50)) {
      lines.push(`- ${group.contentHash}: ${group.count}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderRootMarkdown(params: {
  generatedAt: string;
  sourceDir: string;
  sections: SectionInventory[];
}) {
  const lines = [
    "# Papers Inventory",
    "",
    `- Generated at: ${params.generatedAt}`,
    `- Source dir: ${params.sourceDir}`,
    "",
    "## Sections",
    "",
    "| section | type | files/bundles | questions/items | duplicates | invalid files |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];

  for (const section of params.sections) {
    const filesOrBundles =
      section.sectionType === "generated-year" ? section.bundleFiles : section.filesFound;
    const questionsOrItems =
      section.sectionType === "generated-year" ? section.itemCount : section.questionCount;
    lines.push(
      `| ${section.section} | ${section.sectionType} | ${filesOrBundles} | ${questionsOrItems} | ${section.duplicateContentHashGroups.length} | ${section.invalidFiles.length} |`,
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(process.cwd(), args.sourceDir);
  const generatedAt = new Date().toISOString();
  const sections: SectionInventory[] = [];

  const realPapersDir = path.join(sourceDir, "real-papers");
  if (fs.existsSync(realPapersDir)) {
    sections.push(await inventoryRealPapers(realPapersDir, generatedAt));
  }

  const yearDirs = fs.existsSync(sourceDir)
    ? fs
        .readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
        .map((entry) => path.join(sourceDir, entry.name))
        .sort((left, right) => left.localeCompare(right))
    : [];
  for (const yearDir of yearDirs) {
    sections.push(await inventoryGeneratedYear(yearDir, generatedAt));
  }

  const rootPayload = {
    generatedAt,
    sourceDir: repoPath(sourceDir),
    sections: sections.map((section) => ({
      section: section.section,
      sectionType: section.sectionType,
      sourceDir: section.sourceDir,
      filesOrBundles:
        section.sectionType === "generated-year" ? section.bundleFiles : section.filesFound,
      questionsOrItems:
        section.sectionType === "generated-year" ? section.itemCount : section.questionCount,
      duplicateContentHashGroups: section.duplicateContentHashGroups.length,
      invalidFiles: section.invalidFiles.length,
    })),
  };

  const markdown = renderRootMarkdown({
    generatedAt,
    sourceDir: repoPath(sourceDir),
    sections,
  });
  console.log(markdown);

  if (args.write) {
    const outDir = path.resolve(process.cwd(), args.outDir);
    const sectionsDir = path.join(outDir, "sections");
    await mkdir(sectionsDir, { recursive: true });
    await writeFile(path.join(outDir, "papers-inventory.json"), `${JSON.stringify(rootPayload, null, 2)}\n`);
    await writeFile(path.join(outDir, "papers-inventory.md"), markdown);
    for (const section of sections) {
      const base = section.section;
      await writeFile(path.join(sectionsDir, `${base}.json`), `${JSON.stringify(section, null, 2)}\n`);
      await writeFile(path.join(sectionsDir, `${base}.md`), renderSectionMarkdown(section));
    }
    console.log(`Inventory written to ${repoPath(outDir)}`);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
