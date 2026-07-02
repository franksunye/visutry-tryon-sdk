import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@visutry/tryon-core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@visutry/tryon-web": fileURLToPath(
        new URL("./packages/web/src/index.ts", import.meta.url),
      ),
      "@visutry/recommender": fileURLToPath(
        new URL("./packages/recommender/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["packages/**/src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/index.ts", "**/types/**"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
