import { rmSync } from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);

for (const target of targets) {
  const resolved = path.resolve(process.cwd(), target);
  rmSync(resolved, { recursive: true, force: true });
}
