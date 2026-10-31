/**
 * Font previews ("Schriftvorschau", #91): a screenshot of the page a type
 * pairing links for an adobe or local family, which the app cannot load.
 * One per URL, shared by every pairing that links it. Saving a pairing
 * queues a `font_preview` job for each URL that has no preview yet; the
 * capture worker takes it like a URL import, and `completeJob`
 * (import-jobs.server.ts) stores the image.
 */

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { assetsPath } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import { fontPreviews, importJobs } from "@m3-inspo/db/library-schema";
import type { FontRoles } from "@m3-inspo/shared/fonts";
import { fontRoles } from "@m3-inspo/shared/fonts";

/**
 * A font preview as the pages show it: still `capturing`, `ready` with its
 * image, or `failed` with the cleaned reason (if any). A new capture keeps
 * showing the last image until it succeeds.
 */
export type FontPreview = {
  status: "capturing" | "ready" | "failed";
  image: { url: string; width: number; height: number } | null;
  error: string | null;
};

/** The page URLs of a pairing's font roles, each once. */
export const pageUrlsOf = (roles: FontRoles) => [
  ...new Set(fontRoles.flatMap((role) => (roles[role]?.pageUrl ? [roles[role].pageUrl] : []))),
];

const newJob = (pageUrl: string) => ({ kind: "font_preview" as const, requestId: randomUUID(), input: { pageUrl } });

/** Queues a capture for every URL that has no preview yet; URLs with one are left alone. */
export async function queueFontPreviews(urls: string[]) {
  for (const url of urls) {
    await getDb().transaction(async (tx) => {
      // The unique URL decides between two saves at once: the one that inserts the row queues the job.
      const preview = (
        await tx.insert(fontPreviews).values({ url }).onConflictDoNothing({ target: fontPreviews.url }).returning({ id: fontPreviews.id })
      ).at(0);
      if (!preview) return;
      const [job] = await tx.insert(importJobs).values(newJob(url)).returning({ id: importJobs.id });
      await tx.update(fontPreviews).set({ jobId: job.id }).where(eq(fontPreviews.id, preview.id));
    });
  }
}

/**
 * "Neu aufnehmen": queues a new capture of `url`, unless one is already
 * waiting or running. The last image stays until the new one is stored.
 */
export async function recaptureFontPreview(url: string) {
  await getDb().transaction(async (tx) => {
    // The upsert locks the row, so a second click at the same time waits and then sees this job.
    const [preview] = await tx
      .insert(fontPreviews)
      .values({ url })
      .onConflictDoUpdate({ target: fontPreviews.url, set: { url } })
      .returning({ id: fontPreviews.id, jobId: fontPreviews.jobId });
    const { id, jobId } = preview;
    const current = jobId
      ? await tx.query.importJobs.findFirst({ columns: { status: true }, where: eq(importJobs.id, jobId) })
      : undefined;
    if (current?.status === "queued" || current?.status === "processing") return;
    const [job] = await tx.insert(importJobs).values(newJob(url)).returning({ id: importJobs.id });
    await tx.update(fontPreviews).set({ jobId: job.id }).where(eq(fontPreviews.id, id));
  });
}

/** The previews of these URLs, by URL; URLs without a preview are left out. */
export async function findFontPreviews(urls: string[]): Promise<Partial<Record<string, FontPreview>>> {
  if (urls.length === 0) return {};
  const rows = await getDb().query.fontPreviews.findMany({
    where: inArray(fontPreviews.url, urls),
    with: { job: { columns: { status: true, errorMessage: true } } },
  });
  return Object.fromEntries(
    rows.map(({ url, imageKey, imageWidth, imageHeight, job }) => {
      const image = imageKey ? { url: `${assetsPath}${imageKey}`, width: imageWidth ?? 1440, height: imageHeight ?? 900 } : null;
      const capturing = job?.status === "queued" || job?.status === "processing";
      const status = capturing ? "capturing" : image && job?.status !== "failed" ? "ready" : "failed";
      return [url, { status, image, error: job?.status === "failed" ? job.errorMessage : null } satisfies FontPreview];
    }),
  );
}
