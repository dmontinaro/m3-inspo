import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/src/**/*.test.ts"],
    passWithNoTests: true,
    // Real Postgres from compose.yaml; a fresh migrated database per run.
    globalSetup: ["packages/db/test/global-setup.ts"],
  },
});
