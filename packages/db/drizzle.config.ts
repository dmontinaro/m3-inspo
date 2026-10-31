import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env from repo root + this package, so either works
config({ path: "../../.env" });
config({ path: "./.env" });

/**
 * Migrations: `pnpm --filter @m3-inspo/db db:generate`, then `db:migrate`.
 * Committed migrations in ./drizzle are immutable; never `drizzle-kit push`.
 *
 * Auth, library and MCP access schemas are migrated together.
 */
export default defineConfig({
  schema: ["./src/auth-schema.ts", "./src/library-schema.ts", "./src/mcp-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54330/inspo",
  },
  strict: true,
  verbose: true,
});
