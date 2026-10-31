/**
 * Embeddings: `embedding` jobs, run inside the web app by the job runner
 * (job-runner.server.ts), keep each reference's vector in
 * `reference_embeddings` in step with its text. Gallery search, "Ähnliche
 * Referenzen" and the MCP tools rank with these vectors
 * (library.server.ts, @m3-inspo/db catalogue and search).
 *
 * A job is queued (`queueEmbedding` in library.server.ts) whenever the text
 * changes: a new reference, a finished AI analysis (in the transaction that
 * stores it, so the analysis's last step is always its embedding), an edit,
 * a return from the archive, and at start for every reference still without
 * a vector (`queueMissingEmbeddings`). It reads the reference's current text, embeds it
 * (@m3-inspo/db/vector) and stores the vector, replacing the old one. An archived or
 * deleted reference gets none.
 *
 * Logs name the job, the time taken and an error's class, never texts.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { importJobs, referenceEmbeddings, references } from "@m3-inspo/db/library-schema";
import type { AnalysisTags, Bilingual } from "@m3-inspo/db/library-schema";
import { EmbeddingError, documentInput, embedText, embeddingModel } from "@m3-inspo/db/vector";
import { claimJob, heldBy } from "./import-jobs.server";

/** A long note is cut to this many characters, so it does not crowd the rest out of the model's 512 tokens. */
const maxNoteChars = 400;
/** The whole text is cut to this many characters (about 512 tokens), so it fits even small-context models like e5. */
const maxTextChars = 1800;

/** A region's note is cut shorter still: there may be several. */
const maxRegionNoteChars = 160;

type EmbeddedReference = {
  title: string;
  takeNote: string | null;
  avoidNote: string | null;
  tags: string[];
  regions: { componentType: string; note: string | null }[];
};
type EmbeddedAnalysis = { tags: AnalysisTags | null; macrostructure: string | null; description: Bilingual | null };

/**
 * The text that stands for a reference in the vector space: title, the
 * owner's tags, the AI tags, the owner's notes, the regions the owner marked
 * (type and note), then the AI description in English and German. The most
 * telling parts come first, since the end is cut when it gets long.
 */
function embeddingText(reference: EmbeddedReference, analysis: EmbeddedAnalysis | undefined): string {
  // Listed in a fixed order: jsonb does not keep the order the keys were written in.
  const { style = [], industry = [], components = [], vibe = [], colorWords = [] } = analysis?.tags ?? {};
  const aiTags: string[] = [...style, ...industry, ...components, ...vibe, ...colorWords];
  if (analysis?.macrostructure) aiTags.push(analysis.macrostructure);
  const clip = (note: string, max = maxNoteChars) => (note.length > max ? `${note.slice(0, max)}…` : note);
  const regions = reference.regions.map(({ componentType, note }) =>
    [componentType.replaceAll("-", " "), note && clip(note, maxRegionNoteChars)].filter(Boolean).join(": "),
  );
  return [
    reference.title,
    reference.tags.length > 0 && `Tags: ${reference.tags.join(", ")}`,
    aiTags.length > 0 && `Design: ${aiTags.map((tag) => tag.replaceAll("-", " ")).join(", ")}`,
    reference.takeNote && `Take: ${clip(reference.takeNote)}`,
    reference.avoidNote && `Avoid: ${clip(reference.avoidNote)}`,
    regions.length > 0 && `Regions: ${regions.join("; ")}`,
    analysis?.description?.en,
    analysis?.description?.de,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, maxTextChars);
}

/**
 * Stores `vector` as the reference's embedding and marks the job ready, in
 * one transaction; rolls back if the runner lost the job's lease. The
 * reference row is locked first, so archiving (which deletes the embedding,
 * library.server.ts `setStatus`) runs entirely before or after: a reference
 * archived meanwhile gets no vector. Without `vector` only the job is marked.
 */
async function finishEmbedding(job: { id: string; attempt: number }, referenceId?: string, vector?: Float32Array) {
  await getDb().transaction(async (tx) => {
    if (referenceId && vector) {
      const reference = (
        await tx
          .select({ status: references.curationStatus })
          .from(references)
          .where(eq(references.id, referenceId))
          .for("update")
      ).at(0);
      if (reference && reference.status !== "archived") {
        const stored = { model: embeddingModel(), embedding: Array.from(vector) };
        await tx
          .insert(referenceEmbeddings)
          .values({ referenceId, ...stored })
          .onConflictDoUpdate({ target: referenceEmbeddings.referenceId, set: { ...stored, updatedAt: sql`now()` } });
      }
    }
    const finished = await tx
      .update(importJobs)
      .set({ status: "ready", stage: null, leaseExpiresAt: null })
      .where(heldBy(job.id, job.attempt, ["embedding"]))
      .returning({ id: importJobs.id });
    if (finished.length === 0) tx.rollback();
  });
}

/** An error's class for the log and the job, e.g. "EmbeddingError 429"; never input text. */
function errorClass(error: unknown) {
  if (error instanceof EmbeddingError) return `${error.name} ${error.status ?? ""}`.trim();
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Claims the oldest queued embedding job and runs it. False if the queue was
 * empty. A failure ends the job as failed; the next change to the reference
 * queues a new one.
 */
export async function runNextEmbedding(): Promise<boolean> {
  const job = await claimJob(["embedding"]);
  if (!job) return false;

  const started = performance.now();
  try {
    const row = await getDb().query.importJobs.findFirst({
      columns: {},
      where: eq(importJobs.id, job.id),
      with: {
        reference: {
          columns: { id: true, title: true, takeNote: true, avoidNote: true, tags: true, curationStatus: true },
          with: {
            analyses: {
              columns: { tags: true, macrostructure: true, description: true },
              orderBy: (analysis, { desc }) => [desc(analysis.version)],
              limit: 1,
            },
            regions: {
              columns: { componentType: true, note: true },
              orderBy: (region, { asc }) => [asc(region.createdAt)],
            },
          },
        },
      },
    });
    const reference = row?.reference;
    // Deleted or archived since the job was queued: nothing to embed.
    if (!reference || reference.curationStatus === "archived") {
      await finishEmbedding(job);
      return true;
    }
    const vector = await embedText(documentInput(embeddingText(reference, reference.analyses.at(0))));
    await finishEmbedding(job, reference.id, vector);
    console.info(`[embedding] job ${job.id} ready after ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    console.error(`[embedding] job ${job.id} failed after ${Math.round(performance.now() - started)} ms: ${errorClass(error)}`);
    await getDb()
      .update(importJobs)
      .set({
        status: "failed",
        stage: null,
        leaseExpiresAt: null,
        errorMessage: error instanceof EmbeddingError ? error.message : errorClass(error),
      })
      .where(heldBy(job.id, job.attempt, ["embedding"]));
  }
  return true;
}

/**
 * Queues an embedding job for every reference that is not archived, has no
 * vector of the current model and no waiting job: references from before
 * embeddings were on, or from before a model change. The job runner calls it
 * once at start. Returns how many jobs it queued.
 */
export async function queueMissingEmbeddings(): Promise<number> {
  const queued = await getDb().execute(sql`
    insert into ${importJobs} (kind, request_id, reference_id, input)
    select 'embedding', gen_random_uuid(), r.id, ${JSON.stringify({ trigger: "backfill" })}::jsonb
    from ${references} r
    where r.curation_status <> 'archived'
      and not exists (select 1 from ${referenceEmbeddings} e where e.reference_id = r.id and e.model = ${embeddingModel()})
      and not exists (select 1 from ${importJobs} j where j.reference_id = r.id and j.kind = 'embedding' and j.status in ('queued', 'processing'))
  `);
  return queued.count;
}
