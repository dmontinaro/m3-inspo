/**
 * One-off: queues an AI analysis for every reference without a palette
 * (issue #53, src/server/palette-backfill.server.ts). The web app's job
 * runner then works through them. From apps/web:
 *
 *   pnpm backfill-palettes --dry-run   # lists them, queues nothing
 *   pnpm backfill-palettes             # queues them
 *
 * Reads DATABASE_URL and ANTHROPIC_API_KEY from the environment, falling
 * back to the repo's .env. Prints the target database first. The key check
 * only sees this script's environment (where a key from .env can stand in
 * for a missing one), while the jobs run in the web service's job runner:
 * in production, make sure the `web` service has ANTHROPIC_API_KEY set.
 */

import { parseArgs } from "node:util";
import { getDb } from "@m3-inspo/db/client";
import { backfillPalettes } from "../src/server/palette-backfill.server";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = values["dry-run"];

const target = URL.parse(process.env.DATABASE_URL ?? "");
console.info(`Database: ${target ? `${target.host}${target.pathname}` : "DATABASE_URL is not set"}`);

const db = getDb();
try {
  const due = await backfillPalettes(db, { dryRun });
  if (due === "disabled") {
    console.error("ANTHROPIC_API_KEY is not set, so no analysis would ever run. Nothing queued.");
    process.exitCode = 1;
  } else {
    for (const reference of due) console.info(`  ${reference.slug}  ${reference.title}`);
    console.info(
      dryRun
        ? `Dry run: ${due.length} references without palette would get an AI analysis. Nothing queued.`
        : `Queued an AI analysis for ${due.length} references without palette.`,
    );
  }
} finally {
  await db.$client.end();
}
