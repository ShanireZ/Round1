import { rmSync } from "node:fs";
import path from "node:path";

for (const target of process.argv.slice(2)) {
  const resolved = path.resolve(process.cwd(), target);
  rmSync(resolved, { recursive: true, force: true });
}
