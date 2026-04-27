import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_SRC = path.join(ROOT, "client", "src");

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_RELATIVE_PATHS = new Set([
  path.join("client", "src", "pages", "dev", "UIGallery.tsx"),
]);

const COLOR_LITERAL_PATTERNS = [
  /#[0-9A-Fa-f]{3,8}\b/g,
  /\brgba?\s*\(/g,
  /\bhsla?\s*\(/g,
];

type Violation = {
  file: string;
  line: number;
  text: string;
};

function toRelative(filePath: string): string {
  return path.relative(ROOT, filePath);
}

function shouldScan(filePath: string): boolean {
  const relative = toRelative(filePath);
  return SCANNED_EXTENSIONS.has(path.extname(filePath)) && !IGNORED_RELATIVE_PATHS.has(relative);
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }

    return shouldScan(fullPath) ? [fullPath] : [];
  });
}

function findViolations(filePath: string): Violation[] {
  const relative = toRelative(filePath);
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const hasRawColor = COLOR_LITERAL_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });

    if (hasRawColor) {
      violations.push({
        file: relative,
        line: index + 1,
        text: line.trim(),
      });
    }
  });

  return violations;
}

const violations = walk(CLIENT_SRC).flatMap(findViolations);

if (violations.length > 0) {
  console.error("verifyUiTokenUsage: raw color literals found in client TS/TSX files.");
  console.error("Use design tokens, semantic Tailwind classes, or shared CSS utilities instead.");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.text}`);
  }
  process.exit(1);
}

console.log(`verifyUiTokenUsage: ok (${walk(CLIENT_SRC).length} files checked)`);
