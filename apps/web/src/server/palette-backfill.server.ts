/**
 * One-off backfill: an AI analysis for every reference without a palette
 * (screenshots never analysed, older URL imports), so the generator's pool
 * holds the whole library (issue #53). Run by scripts/backfill-palettes.ts.
 * The jobs are the same ones "Neu analysieren" queues (`analysisJob`); the
 * web app's job runner works through them one at a time.
 */

import { and, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import { importJobs, referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import { analysisEnabled, analysisJob } from "./library.server";
import type { Queries } from "./library.server";

/** The first colour of the reference's latest analysis, null when it has no palette or no analysis. */
const latestPaletteColour = sql`(
  select ${referenceAnalyses.tokens} -> 'palette' -> 0 from ${referenceAnalyses}
  where ${referenceAnalyses.referenceId} = ${references.id}
  order by ${referenceAnalyses.version} desc limit 1
)`;

/**
 * Queues an AI analysis for every reference that is not archived, has no
 * palette in its latest analysis (or no analysis yet) and no analysis
 * waiting or running. With `dryRun` it only lists them. Returns the
 * references, oldest first, or "disabled" without ANTHROPIC_API_KEY: then
 * the job runner would never run them, so nothing is queued.
 */
export async function backfillPalettes(db: Queries, { dryRun }: { dryRun: boolean }) {
  if (!analysisEnabled()) return "disabled";

  const due = await db
    .select({ id: references.id, slug: references.slug, title: references.title })
    .from(references)
    .where(
      and(
        ne(references.curationStatus, "archived"),
        isNull(latestPaletteColour),
        notExists(
          db
            .select({ id: importJobs.id })
            .from(importJobs)
            .where(
              and(
                eq(importJobs.referenceId, references.id),
                eq(importJobs.kind, "analysis"),
                inArray(importJobs.status, ["queued", "processing"]),
              ),
            ),
        ),
      ),
    )
    .orderBy(references.createdAt);

  if (!dryRun && due.length > 0) {
    await db.insert(importJobs).values(due.map((reference) => analysisJob(reference.id, "backfill")));
  }
  return due.map(({ slug, title }) => ({ slug, title }));
}
