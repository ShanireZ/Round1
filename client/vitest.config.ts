import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  root: rootDir,
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 15_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
});
