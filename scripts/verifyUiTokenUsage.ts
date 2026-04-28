import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_SRC = path.join(ROOT, "client", "src");

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const BROWSER_HINT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const IGNORED_RELATIVE_PATHS = new Set([
  path.join("client", "src", "pages", "dev", "UIGallery.tsx"),
]);

const COLOR_LITERAL_PATTERNS = [/#[0-9A-Fa-f]{3,8}\b/g, /\brgba?\s*\(/g, /\bhsla?\s*\(/g];

const INLINE_STYLE_PATTERNS = [/\bstyle\s*=\s*\{\s*\{/g, /\bstyle\s*=\s*\{/g];

const CSS_COMPAT_CHECKS = [
  {
    reason: "Chrome < 111 CSS compat warning",
    patterns: [/\bcolor-mix\s*\(/g],
  },
  {
    reason: "Firefox 22+ CSS compat warning",
    patterns: [/\bmin-(?:height|width)\s*:\s*auto\b/g],
  },
];

type Violation = {
  file: string;
  line: number;
  text: string;
  reason?: string;
};

function toRelative(filePath: string): string {
  return path.relative(ROOT, filePath);
}

function shouldScan(filePath: string): boolean {
  const relative = toRelative(filePath);
  return SCANNED_EXTENSIONS.has(path.extname(filePath)) && !IGNORED_RELATIVE_PATHS.has(relative);
}

function shouldScanBrowserHints(filePath: string): boolean {
  return BROWSER_HINT_EXTENSIONS.has(path.extname(filePath));
}

function shouldInclude(filePath: string): boolean {
  return shouldScan(filePath) || shouldScanBrowserHints(filePath);
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }

    return shouldInclude(fullPath) ? [fullPath] : [];
  });
}

function findViolations(filePath: string): Violation[] {
  if (!shouldScan(filePath)) {
    return [];
  }

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

function findBrowserHintViolations(filePath: string): Violation[] {
  if (!shouldScanBrowserHints(filePath)) {
    return [];
  }

  const relative = toRelative(filePath);
  const extension = path.extname(filePath);
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const checks =
      extension === ".css"
        ? CSS_COMPAT_CHECKS
        : [
            { reason: "no inline JSX styles", patterns: INLINE_STYLE_PATTERNS },
            ...CSS_COMPAT_CHECKS,
          ];

    for (const check of checks) {
      const matched = check.patterns.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(line);
      });

      if (matched) {
        violations.push({
          file: relative,
          line: index + 1,
          text: line.trim(),
          reason: check.reason,
        });
      }
    }
  });

  return violations;
}

const scannedFiles = walk(CLIENT_SRC);
const violations = scannedFiles.flatMap(findViolations);
const browserHintViolations = scannedFiles.flatMap(findBrowserHintViolations);

if (violations.length > 0) {
  console.error("verifyUiTokenUsage: raw color literals found in client TS/TSX files.");
  console.error("Use design tokens, semantic Tailwind classes, or shared CSS utilities instead.");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.text}`);
  }
  process.exit(1);
}

if (browserHintViolations.length > 0) {
  console.error("verifyUiTokenUsage: browser hint regressions found in client source files.");
  console.error(
    "Move JSX style props to classes/tokens and avoid CSS APIs outside the browser baseline.",
  );
  for (const violation of browserHintViolations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.reason}] ${violation.text}`);
  }
  process.exit(1);
}

console.log(`verifyUiTokenUsage: ok (${scannedFiles.length} files checked)`);
