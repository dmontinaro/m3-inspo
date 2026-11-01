import { defineConfig } from "vitest/config";

/** Pure catalog/routing checks need neither Postgres nor a running app. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["src/i18n/*.test.ts", "src/lib/sign-in.test.ts", "src/lib/page-paths.test.ts"] },
});
