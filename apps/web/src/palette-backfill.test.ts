/**
 * The one-off palette backfill (scripts/backfill-palettes.ts): which
 * references get an AI analysis, the dry run and the refusal without
 * ANTHROPIC_API_KEY. Each test works inside a transaction that is rolled
 * back, so the jobs it queues never reach the analysis tests running in
 * parallel on the same database.
 */

import { randomUUID } from "node:crypto";
import { TransactionRollbackError, and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { importJobs, referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import type { AnalysisTokens, CurationStatus } from "@m3-inspo/db/library-schema";
import { backfillPalettes } from "./server/palette-backfill.server";
import { analysisJob } from "./server/library.server";
import type { Queries } from "./server/library.server";
// Types for `inject("databaseUrl")`, declared next to the setup that provides it.
import type {} from "@m3-inspo/db/test-setup";

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Runs `work` in a transaction and rolls it back afterwards; a failing assertion inside still fails the test. */
async function rolledBack(work: (tx: Queries) => Promise<void>) {
  await getDb()
    .transaction(async (tx) => {
      await work(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

type Fixture = {
  status?: CurationStatus;
  /** Palettes of the analysis versions, oldest first; `undefined` is a version without palette. */
  palettes?: (string[] | undefined)[];
  /** The status of an analysis job for the reference, if there is one. */
  job?: "queued" | "processing" | "failed" | "ready";
};

/** Inserts a reference as described and returns its slug. */
async function reference(tx: Queries, title: string, { status = "draft", palettes = [], job }: Fixture = {}) {
  const slug = `backfill-${randomUUID()}`;
  const [{ id }] = await tx
    .insert(references)
    .values({ slug, title, sourceKind: "image", curationStatus: status })
    .returning({ id: references.id });
  for (const [index, palette] of palettes.entries()) {
    const tokens: AnalysisTokens = palette ? { palette: palette.map((value) => ({ value, source: "vision" })) } : {};
    await tx.insert(referenceAnalyses).values({ referenceId: id, version: index + 1, tokens, generatedBy: "analysis" });
  }
  if (job) await tx.insert(importJobs).values({ ...analysisJob(id, "owner"), status: job });
  return slug;
}

/** The slugs among `slugs` with an analysis job queued by the backfill, sorted. */
async function backfilled(tx: Queries, slugs: string[]) {
  const rows = await tx
    .select({ slug: references.slug })
    .from(importJobs)
    .innerJoin(references, eq(importJobs.referenceId, references.id))
    .where(and(inArray(references.slug, slugs), sql`${importJobs.input} ->> 'trigger' = 'backfill'`));
  return rows.map((row) => row.slug).sort();
}

/** Fixtures for every case; returns the slugs that should get an analysis and those that should not. */
async function library(tx: Queries) {
  const due = [
    await reference(tx, "Never analysed"),
    await reference(tx, "Analysed without palette", { palettes: [undefined] }),
    await reference(tx, "Latest version lost its palette", { palettes: [["#ffffff"], []] }),
    await reference(tx, "Last analysis failed", { job: "failed" }),
    await reference(tx, "Approved without palette", { status: "approved", job: "ready", palettes: [undefined] }),
  ];
  const skipped = [
    await reference(tx, "Has a palette", { palettes: [["#f4efe6", "#1a1a1a"]] }),
    await reference(tx, "Palette in the latest version", { palettes: [undefined, ["#f4efe6"]] }),
    await reference(tx, "Analysis waiting", { job: "queued" }),
    await reference(tx, "Analysis running", { job: "processing" }),
    await reference(tx, "Archived", { status: "archived" }),
  ];
  return { due, skipped };
}

const slugsOf = (result: Awaited<ReturnType<typeof backfillPalettes>>) =>
  result === "disabled" ? [] : result.map((entry) => entry.slug);

describe("the palette backfill", () => {
  it("queues one analysis per reference without palette, skipping open jobs and archived ones", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    await rolledBack(async (tx) => {
      const { due, skipped } = await library(tx);

      const queued = slugsOf(await backfillPalettes(tx, { dryRun: false }));

      expect(queued).toEqual(expect.arrayContaining(due));
      expect(queued.filter((slug) => skipped.includes(slug))).toEqual([]);
      expect(await backfilled(tx, [...due, ...skipped])).toEqual([...due].sort());
      // A second run finds their jobs waiting and queues none of them again.
      const again = slugsOf(await backfillPalettes(tx, { dryRun: false }));
      expect(again.filter((slug) => due.includes(slug))).toEqual([]);
      expect(await backfilled(tx, due)).toEqual([...due].sort());
    });
  });

  it("lists the same references on a dry run without queueing anything", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    await rolledBack(async (tx) => {
      const { due, skipped } = await library(tx);

      const listed = await backfillPalettes(tx, { dryRun: true });

      expect(slugsOf(listed)).toEqual(expect.arrayContaining(due));
      expect(slugsOf(listed).filter((slug) => skipped.includes(slug))).toEqual([]);
      expect(listed).toContainEqual({ slug: due[0], title: "Never analysed" });
      expect(await backfilled(tx, due)).toEqual([]);
    });
  });

  it("refuses without ANTHROPIC_API_KEY and queues nothing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await rolledBack(async (tx) => {
      const slug = await reference(tx, "Never analysed");

      expect(await backfillPalettes(tx, { dryRun: false })).toBe("disabled");
      expect(await backfilled(tx, [slug])).toEqual([]);
    });
  });
});
