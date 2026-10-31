/**
 * The font catalog (`font_catalog`): a daily mirror of Fontsource's metadata
 * API, the only catalog source for type pairings (#36). The family search
 * and the family lookup read only the mirror, so they work while Fontsource
 * is down; a failed sync keeps the last state.
 *
 * `startFontCatalogSync` runs with the server (job-runner.plugin.ts):
 * it syncs at startup when the mirror is older than a day and checks again
 * every hour, so a failed sync is retried within the hour.
 */

import { and, asc, eq, ilike, inArray, lt, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { fontCatalog } from "@m3-inspo/db/library-schema";
import type { FontCategory } from "#/lib/fonts";

const catalogUrl = "https://api.fontsource.org/v1/fonts";
const dayMs = 86_400_000;
const checkMs = 3_600_000;

/** Fontsource's categories onto ours; icon fonts are left out, "other" counts as display. */
const categories: Partial<Record<string, FontCategory>> = {
  "sans-serif": "sans",
  serif: "serif",
  monospace: "mono",
  display: "display",
  handwriting: "handwriting",
  other: "display",
};

/** One family as api.fontsource.org/v1/fonts lists it; fields we do not keep are ignored. */
const fontsourceFamily = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  category: z.string(),
  weights: z.array(z.number().int()),
  styles: z.array(z.string()),
  variable: z.boolean(),
  license: z.string(),
  type: z.string(),
  lastModified: z.string(),
});

type CatalogRow = typeof fontCatalog.$inferSelect;

/** A catalog family as the app uses it; `cssFamily` is the name to write in CSS (variable packages add " Variable"). */
export type CatalogFont = Omit<CatalogRow, "syncedAt"> & { cssFamily: string };

const toCatalogFont = ({ syncedAt: _, ...row }: CatalogRow): CatalogFont => ({
  ...row,
  cssFamily: row.variable ? `${row.family} Variable` : row.family,
});

/**
 * Fetches Fontsource's family list and replaces the mirror with it in one
 * transaction: known families are updated, new ones added, dropped ones
 * removed. Throws (and changes nothing) when Fontsource fails or sends no
 * usable family. Returns the number of families mirrored.
 */
export async function syncFontCatalog() {
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Fontsource answered ${response.status}`);
  const list = z.array(z.unknown()).parse(await response.json());

  const syncedAt = new Date();
  const rows = list.flatMap((entry) => {
    const parsed = fontsourceFamily.safeParse(entry);
    const category = parsed.success ? categories[parsed.data.category] : undefined;
    if (!parsed.success || !category) return [];
    const { id, family, weights, styles, variable, license, type, lastModified } = parsed.data;
    return [{ id, family, category, weights, styles, variable, license, google: type === "google", lastModified, syncedAt }];
  });
  if (rows.length === 0) throw new Error("Fontsource sent no usable family");

  await getDb().transaction(async (tx) => {
    for (let start = 0; start < rows.length; start += 500) {
      await tx
        .insert(fontCatalog)
        .values(rows.slice(start, start + 500))
        .onConflictDoUpdate({
          target: fontCatalog.id,
          set: {
            family: sql`excluded.family`,
            category: sql`excluded.category`,
            weights: sql`excluded.weights`,
            styles: sql`excluded.styles`,
            variable: sql`excluded.variable`,
            license: sql`excluded.license`,
            google: sql`excluded.google`,
            lastModified: sql`excluded.last_modified`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
    await tx.delete(fontCatalog).where(lt(fontCatalog.syncedAt, syncedAt));
  });
  return rows.length;
}

/**
 * Starts the daily sync: right away when the mirror is empty or older than
 * a day, then an hourly check. Failures are logged, never thrown, so the
 * server starts without network. Returns `stop`.
 */
export function startFontCatalogSync() {
  const syncIfStale = async () => {
    try {
      const [{ lastSync }] = await getDb().select({ lastSync: max(fontCatalog.syncedAt) }).from(fontCatalog);
      if (lastSync && Date.now() - lastSync.getTime() < dayMs) return;
      console.info(`[fonts] catalog synced: ${await syncFontCatalog()} families`);
    } catch (error) {
      console.error(`[fonts] catalog sync failed: ${error instanceof Error ? error.message : typeof error}`);
    }
  };
  void syncIfStale();
  const timer = setInterval(() => void syncIfStale(), checkMs);
  return () => clearInterval(timer);
}

/** The catalog family with exactly this name, ignoring case and surrounding spaces, or null. */
export async function findCatalogFont(family: string) {
  const rows = await getDb()
    .select()
    .from(fontCatalog)
    .where(eq(sql`lower(${fontCatalog.family})`, family.trim().toLowerCase()))
    .limit(1);
  return rows.map(toCatalogFont).at(0) ?? null;
}

/** The catalog families with these Fontsource ids; ids the catalog does not know are left out. */
export async function findCatalogFontsById(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await getDb().select().from(fontCatalog).where(inArray(fontCatalog.id, ids));
  return rows.map(toCatalogFont);
}

/**
 * Families whose name contains `query` (any case; LIKE wildcards count as
 * plain text), optionally of one category: names starting with the query
 * first, then shorter names, then alphabetically. An empty query lists the
 * category.
 */
export async function searchFonts({ query, category, limit = 20 }: { query: string; category?: FontCategory; limit?: number }) {
  const text = query.trim().replace(/[\\%_]/g, "\\$&");
  const rows = await getDb()
    .select()
    .from(fontCatalog)
    .where(and(ilike(fontCatalog.family, `%${text}%`), category ? eq(fontCatalog.category, category) : undefined))
    .orderBy(
      sql`${fontCatalog.family} ilike ${`${text}%`} desc`,
      sql`length(${fontCatalog.family})`,
      asc(fontCatalog.family),
    )
    .limit(limit);
  return rows.map(toCatalogFont);
}
