import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/__tests__/**/*.test.ts", "server/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: [path.resolve(rootDir, "server/__tests__/vitest-env.setup.ts")],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: [
        "server/**/__tests__/**",
        "server/**/*.test.ts",
        "server/db/migrations/**",
      ],
    },
    testTimeout: 15_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "server"),
    },
  },
});
