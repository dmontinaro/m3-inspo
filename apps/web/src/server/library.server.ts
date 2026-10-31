/**
 * The library: creating, reading and curating references. Server functions
 * (library.functions.ts) call only this module; import jobs
 * (import-jobs.server.ts) store their captures through it, and queue the AI
 * analysis (`analysisJob`) and the embedding (`queueEmbedding`) a new
 * reference gets. The global owner gate in src/start.ts has already let
 * every caller in.
 */

import { randomUUID } from "node:crypto";
import { and, arrayContains, cosineDistance, eq, inArray, lte, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { assetsPath } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import type { Database } from "@m3-inspo/db/client";
import {
  collectionReferences,
  collections,
  importJobs,
  referenceCaptures,
  referenceEmbeddings,
  references,
} from "@m3-inspo/db/library-schema";
import type { AnalysisInput, CurationStatus, EmbeddingInput, ReferenceDevice } from "@m3-inspo/db/library-schema";
import {
  embedQuery,
  embeddingModel,
  embeddingsEnabled,
  fuseRankings,
  minNeighbourSimilarity,
  minQuerySimilarity,
} from "@m3-inspo/db/vector";
import { z } from "zod";
import { deviceOfImage, devices, focusAreas, maxAttributionLength, maxSourceUrlLength } from "#/lib/curation";
import { disallowedTagCharacters, maxTagLength, maxTags, normalizeTag } from "#/lib/tags";
import { maxNoteLength, maxTitleLength } from "#/lib/upload-limits";
import { forgetSourceReference } from "./brand-kits.server";
import { imageFormats, prepareImage } from "./image.server";
import type { PreparedImage } from "./image.server";
import { slugify, withRandomSuffix } from "./slug";
import { getStorage } from "./storage.server";

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((value) => value || null);

const isWebAddress = (value: string) => /^https?:$/.test(URL.parse(value)?.protocol ?? "");

/**
 * The curation fields of the upload sheet and the edit form, as form values.
 * Empty fields become null; messages are for the owner.
 */
export const referenceFields = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Titel ein.")
    .max(maxTitleLength, `Der Titel ist zu lang (höchstens ${maxTitleLength} Zeichen).`),
  // "stripe.com/pricing" becomes "https://stripe.com/pricing"; other schemes stay and are turned away.
  sourceUrl: optionalText(maxSourceUrlLength, `Die Adresse ist zu lang (höchstens ${maxSourceUrlLength} Zeichen).`)
    .transform((value) => (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value))
    .refine(
      (value) => value === null || isWebAddress(value),
      "Bitte gib eine vollständige Adresse ein, die mit https:// oder http:// beginnt.",
    ),
  attribution: optionalText(
    maxAttributionLength,
    `Der Urheberhinweis ist zu lang (höchstens ${maxAttributionLength} Zeichen).`,
  ),
  takeNote: optionalText(maxNoteLength, `Die Notiz ist zu lang (höchstens ${maxNoteLength} Zeichen).`),
  avoidNote: optionalText(maxNoteLength, `Die Notiz ist zu lang (höchstens ${maxNoteLength} Zeichen).`),
  focus: z
    .enum(["", ...focusAreas], "Bitte wähle einen Fokus aus der Liste.")
    .transform((value) => value || null),
  device: z.enum(devices, "Bitte wähle ein Format aus der Liste."),
  // One form entry per chip; an entry with commas (typed, not yet a chip) holds several.
  tags: z
    .array(z.string())
    .transform((entries) => [...new Set(entries.flatMap((entry) => entry.split(",")).map(normalizeTag))].filter(Boolean))
    .refine(
      (tags) => tags.every((tag) => tag.replace(disallowedTagCharacters, "") === tag),
      "Tags dürfen nur Buchstaben, Ziffern, Leerzeichen, - und _ enthalten.",
    )
    .refine(
      (tags) => tags.every((tag) => tag.length <= maxTagLength),
      `Ein Tag ist zu lang (höchstens ${maxTagLength} Zeichen).`,
    )
    .refine((tags) => tags.length <= maxTags, `Höchstens ${maxTags} Tags.`),
});

/** What the upload sheet sends besides the file. Multi-file uploads send only a title. */
const imageUpload = referenceFields.pick({ title: true, takeNote: true, avoidNote: true, sourceUrl: true, tags: true });

type UploadResult = { ok: true; slug: string } | { ok: false; reason: string };

/**
 * Whether the AI analysis is on: only with ANTHROPIC_API_KEY set. Without
 * it no analysis jobs are created, and import, curation and text search
 * work as before.
 */
export const analysisEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * The import job that asks for an AI analysis of `referenceId`, for the
 * caller to insert (in its own transaction, if it has one). The web app's
 * analysis runner picks it up (analysis.server.ts). Only insert it when
 * `analysisEnabled()`.
 */
export function analysisJob(referenceId: string, trigger: AnalysisInput["trigger"]) {
  const input: AnalysisInput = { trigger };
  return { kind: "analysis" as const, requestId: randomUUID(), referenceId, input };
}

/** `getDb()` or a transaction of it. */
export type Queries = Pick<Database, "select" | "insert">;

/**
 * Queues a refresh of `referenceId`'s embedding (embedding.server.ts), for
 * whatever changed the text it is computed from: a new reference, a new
 * analysis, an edit, a return from the archive. Does nothing without
 * EMBEDDINGS_API_KEY, or when a refresh for the reference is still waiting (it
 * will read the new text). Pass `tx` to queue it with the change itself.
 */
export async function queueEmbedding(tx: Queries, referenceId: string, trigger: EmbeddingInput["trigger"]) {
  if (!embeddingsEnabled()) return;
  const waiting = await tx
    .select({ id: importJobs.id })
    .from(importJobs)
    .where(and(eq(importJobs.kind, "embedding"), eq(importJobs.status, "queued"), eq(importJobs.referenceId, referenceId)))
    .limit(1);
  if (waiting.length > 0) return;
  const input: EmbeddingInput = { trigger };
  await tx.insert(importJobs).values({ kind: "embedding", requestId: randomUUID(), referenceId, input });
}

/**
 * Checks and stores an uploaded image and creates its reference with the
 * upload sheet's fields (`title`, `takeNote`, `avoidNote` and `sourceUrl` as
 * strings, `tags` as a list) and queues its AI analysis and its embedding
 * (each if on). Its format follows the image's proportions (`deviceOfImage`). Uploads are approved right away in this phase; drafts arrive with
 * URL import. Returns a German reason for the owner when the input is
 * rejected.
 */
export async function createImageReference(imageFile: unknown, input: Record<string, unknown>): Promise<UploadResult> {
  const parsed = imageUpload.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Die Angaben sind ungültig." };
  const fields = parsed.data;
  if (!(imageFile instanceof File)) return { ok: false, reason: "Bitte wähle eine Bilddatei aus." };

  const check = await prepareImage(new Uint8Array(await imageFile.arrayBuffer()));
  if (!check.ok) return check;

  const referenceId = randomUUID();
  const capture = await storeCapture(referenceId, check.image, { viewport: "upload", kind: "original" });

  try {
    const slug = await freeSlug(fields.title);
    await getDb().transaction(async (tx) => {
      await tx.insert(references).values({
        id: referenceId,
        slug,
        ...fields,
        siteHost: siteHostOf(fields.sourceUrl),
        device: deviceOfImage(check.image.original),
        sourceKind: "image",
        curationStatus: "approved",
      });
      await tx.insert(referenceCaptures).values(capture.row);
      if (analysisEnabled()) await tx.insert(importJobs).values(analysisJob(referenceId, "upload"));
      await queueEmbedding(tx, referenceId, "upload");
    });
    return { ok: true, slug };
  } catch (error) {
    await deleteFiles(capture.keys);
    throw error;
  }
}

type NewCapture = typeof referenceCaptures.$inferInsert;

/**
 * Writes a checked image as a capture of `referenceId`: original, preview and
 * thumbnail in a folder of their own. Returns the capture row to insert and
 * the written keys, so a caller whose insert fails can delete them again
 * (`deleteFiles`).
 */
export async function storeCapture(
  referenceId: string,
  image: PreparedImage,
  placement: Pick<NewCapture, "viewport" | "kind">,
): Promise<{ row: NewCapture; keys: string[] }> {
  const captureId = randomUUID();
  const folder = `references/${referenceId}/${captureId}`;
  const files = [
    { key: `${folder}/original.${imageFormats[image.format].extension}`, ...image.original, contentType: imageFormats[image.format].contentType },
    { key: `${folder}/preview.webp`, ...image.preview, contentType: "image/webp" },
    { key: `${folder}/thumb.webp`, ...image.thumb, contentType: "image/webp" },
  ] as const;
  const [original, preview, thumb] = files;

  const storage = getStorage();
  await Promise.all(files.map((file) => storage.write(file.key, file.data, file.contentType)));

  return {
    keys: files.map((file) => file.key),
    row: {
      id: captureId,
      referenceId,
      ...placement,
      assetKey: original.key,
      thumbKey: thumb.key,
      variants: {
        preview: { key: preview.key, width: preview.width, height: preview.height },
        thumb: { key: thumb.key, width: thumb.width, height: thumb.height },
      },
      width: original.width,
      height: original.height,
      contentHash: image.contentHash,
    },
  };
}

/** Deletes stored files after a failed insert; a file that cannot be deleted is left behind. */
export async function deleteFiles(keys: string[]) {
  const storage = getStorage();
  await Promise.allSettled(keys.map((key) => storage.delete(key)));
}

export type GalleryFilters = {
  /** Only this status; without it, every reference that is not archived. */
  status?: CurationStatus;
  favorites?: boolean;
  /** Only references in this format. */
  device?: ReferenceDevice;
  /** Only references with this tag, e.g. a project. */
  tag?: string;
  /**
   * Words to find in title, notes, focus and tags; each word matches as a
   * prefix. With embeddings on, references close in meaning are found too.
   */
  query?: string;
  /** Only references in the collection with this slug, in its order. */
  collection?: string;
};

/**
 * The gallery: references matching `filters`, newest first (in the
 * collection's order when filtered by one), each with its tags and its first
 * capture's thumbnail URL. A search with embeddings on is ranked instead
 * (`hybridRanking`); without them, or when the query cannot be embedded, it
 * is a plain text search in the usual order.
 */
export async function listReferences(filters: GalleryFilters = {}) {
  // Only letters and digits reach to_tsquery, so the owner's input is never search syntax.
  const words = filters.query?.match(/[\p{L}\p{N}]+/gu) ?? [];
  const positions = filters.collection ? await collectionPositions(filters.collection) : undefined;
  if (positions?.size === 0) return [];

  const scope = and(
    filters.status ? eq(references.curationStatus, filters.status) : ne(references.curationStatus, "archived"),
    filters.favorites ? eq(references.isFavorite, true) : undefined,
    filters.device ? eq(references.device, filters.device) : undefined,
    filters.tag ? arrayContains(references.tags, [normalizeTag(filters.tag)]) : undefined,
    positions ? inArray(references.id, [...positions.keys()]) : undefined,
  );
  const textQuery = words.length > 0 ? sql`to_tsquery('simple', ${words.map((word) => `${word}:*`).join(" & ")})` : undefined;
  const ranking = textQuery && filters.query ? await hybridRanking(scope, textQuery, filters.query) : null;
  if (ranking?.length === 0) return [];

  const cards = await referenceCards(
    ranking ? inArray(references.id, ranking) : and(scope, textQuery && sql`${references.searchDocument} @@ ${textQuery}`),
  );
  if (ranking) cards.sort((a, b) => ranking.indexOf(a.id) - ranking.indexOf(b.id));
  else if (positions) cards.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
  return cards.map(({ id: _id, ...card }) => card);
}

/**
 * References matching `where` as gallery tiles, newest first: title, status,
 * favorite, format, tags, the slugs of the collections it is in (for the
 * gallery's stacks) and the first capture's thumbnail and preview URLs (a
 * mobile tile shows the whole screen, which the 16:10 thumbnail cuts off).
 * References without a capture are left out.
 */
async function referenceCards(where: SQL | undefined) {
  const rows = await getDb().query.references.findMany({
    columns: { id: true, slug: true, title: true, curationStatus: true, isFavorite: true, device: true, tags: true },
    where,
    orderBy: (reference, { desc }) => [desc(reference.createdAt)],
    with: {
      captures: {
        columns: { thumbKey: true, variants: true },
        orderBy: (capture, { asc }) => [asc(capture.createdAt)],
        limit: 1,
      },
      collectionEntries: { columns: {}, with: { collection: { columns: { slug: true } } } },
    },
  });
  return rows.flatMap(({ captures, collectionEntries, ...reference }) => {
    const capture = captures.at(0);
    if (!capture) return [];
    return [
      {
        ...reference,
        collections: collectionEntries.map((entry) => entry.collection.slug),
        thumbUrl: `${assetsPath}${capture.thumbKey}`,
        previewUrl: `${assetsPath}${capture.variants.preview.key}`,
      },
    ];
  });
}

/** How many references the meaning side of a gallery search adds at most. */
const semanticCandidates = 24;

/**
 * The order of a gallery search with embeddings: ids of references in `scope`
 * that match the words (best `ts_rank` first) fused by reciprocal rank
 * (`fuseRankings`) with those closest in meaning to the query (cosine at
 * least `minQuerySimilarity`, at most `semanticCandidates`, never archived).
 * So a German search finds a reference described in English. Null without
 * EMBEDDINGS_API_KEY or when the query cannot be embedded; the caller then
 * searches by text alone.
 */
async function hybridRanking(scope: SQL | undefined, textQuery: SQL, query: string): Promise<string[] | null> {
  const queryVector = await embedQuery(query);
  if (!queryVector) return null;
  const distance = cosineDistance(referenceEmbeddings.embedding, Array.from(queryVector));
  const [byText, byMeaning] = await Promise.all([
    getDb()
      .select({ id: references.id })
      .from(references)
      .where(and(scope, sql`${references.searchDocument} @@ ${textQuery}`))
      .orderBy(sql`ts_rank(${references.searchDocument}, ${textQuery}) desc, ${references.createdAt} desc`),
    getDb()
      .select({ id: references.id })
      .from(references)
      .innerJoin(referenceEmbeddings, eq(referenceEmbeddings.referenceId, references.id))
      .where(
        and(
          scope,
          ne(references.curationStatus, "archived"),
          eq(referenceEmbeddings.model, embeddingModel()),
          lte(distance, 1 - minQuerySimilarity),
        ),
      )
      .orderBy(distance)
      .limit(semanticCandidates),
  ]);
  return fuseRankings(
    byText.map((row) => row.id),
    byMeaning.map((row) => row.id),
  );
}

/** How many similar references the detail view shows. */
const similarLimit = 4;

/**
 * The references closest in meaning to reference `id` as gallery tiles, most
 * similar first, at least `minNeighbourSimilarity` alike, never archived ones. Empty while `id` has no embedding of
 * the current model, e.g. without EMBEDDINGS_API_KEY or once it is archived.
 */
async function similarReferences(id: string) {
  const model = embeddingModel();
  const target = await getDb().query.referenceEmbeddings.findFirst({
    columns: { embedding: true },
    where: and(eq(referenceEmbeddings.referenceId, id), eq(referenceEmbeddings.model, model)),
  });
  if (!target) return [];
  const distance = cosineDistance(referenceEmbeddings.embedding, target.embedding);
  const nearest = await getDb()
    .select({ id: references.id })
    .from(references)
    .innerJoin(referenceEmbeddings, eq(referenceEmbeddings.referenceId, references.id))
    .where(
      and(
        ne(references.id, id),
        ne(references.curationStatus, "archived"),
        eq(referenceEmbeddings.model, model),
        lte(distance, 1 - minNeighbourSimilarity),
      ),
    )
    .orderBy(distance)
    .limit(similarLimit);
  const order = nearest.map((row) => row.id);
  if (order.length === 0) return [];
  const cards = await referenceCards(inArray(references.id, order));
  return cards
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(({ slug, title, thumbUrl }) => ({ slug, title, thumbUrl }));
}

/** Reference id → position in the collection with this slug; empty if the slug is unknown. */
async function collectionPositions(slug: string) {
  const entries = await getDb()
    .select({ referenceId: collectionReferences.referenceId, position: collectionReferences.position })
    .from(collectionReferences)
    .innerJoin(collections, eq(collections.id, collectionReferences.collectionId))
    .where(eq(collections.slug, slug));
  return new Map(entries.map((entry) => [entry.referenceId, entry.position]));
}

/** The order captures are shown in: desktop first view, desktop page, mobile, then uploads. */
const captureOrder = ["desktop/hero", "desktop/full", "mobile/hero", "mobile/full", "upload/original"];

/**
 * One reference with its curation fields, captures and the collections it is
 * in (alphabetically), or null if the slug is unknown. Each capture has its
 * viewport and kind, the URLs of its full-size original and its preview, and
 * the regions marked on it (rectangle in its pixels, type, note, crop thumbnail).
 * `analysis` holds the current design values with their provenance
 * (palette, fonts, tech, mode), or null when none were read. `generated`
 * holds the current AI analysis's tags and texts with the model and version
 * that wrote them, or null before the first one. `analysisJob` is the
 * latest analysis job's state, `analysisEnabled` whether one can be started.
 * `similar` holds the references closest in meaning ("Ähnliche Referenzen").
 */
export async function findReference(slug: string) {
  const reference = await getDb().query.references.findFirst({
    columns: {
      id: true,
      slug: true,
      title: true,
      sourceUrl: true,
      siteHost: true,
      attribution: true,
      curationStatus: true,
      isFavorite: true,
      takeNote: true,
      avoidNote: true,
      focus: true,
      device: true,
      tags: true,
      createdAt: true,
    },
    where: eq(references.slug, slug),
    with: {
      captures: {
        columns: { id: true, viewport: true, kind: true, assetKey: true, variants: true, width: true, height: true },
        orderBy: (capture, { asc }) => [asc(capture.createdAt)],
        with: {
          regions: {
            columns: { id: true, x: true, y: true, width: true, height: true, componentType: true, note: true, thumbKey: true },
            orderBy: (region, { asc }) => [asc(region.createdAt)],
          },
        },
      },
      collectionEntries: { columns: {}, with: { collection: { columns: { slug: true, name: true } } } },
      analyses: {
        columns: {
          version: true,
          tokens: true,
          tech: true,
          mode: true,
          model: true,
          tags: true,
          macrostructure: true,
          description: true,
          layoutSummary: true,
          createdAt: true,
        },
        orderBy: (analysis, { desc }) => [desc(analysis.version)],
        limit: 1,
      },
    },
  });
  if (!reference) return null;

  const [latestJob, similar] = await Promise.all([
    getDb().query.importJobs.findFirst({
      columns: { status: true, errorMessage: true },
      where: and(eq(importJobs.referenceId, reference.id), eq(importJobs.kind, "analysis")),
      orderBy: (job, { desc }) => [desc(job.createdAt)],
    }),
    similarReferences(reference.id),
  ]);

  const { id: _id, captures, analyses, collectionEntries, ...fields } = reference;
  const rank = (capture: { viewport: string; kind: string }) => captureOrder.indexOf(`${capture.viewport}/${capture.kind}`);
  const analysis = analyses.at(0);
  return {
    ...fields,
    collections: collectionEntries
      .map(({ collection }) => collection)
      .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" })),
    captures: [...captures]
      .sort((a, b) => rank(a) - rank(b))
      .map(({ id, viewport, kind, assetKey, variants: { preview }, width, height, regions }) => ({
        id,
        viewport,
        kind,
        width,
        height,
        originalUrl: `${assetsPath}${assetKey}`,
        preview: { url: `${assetsPath}${preview.key}`, width: preview.width, height: preview.height },
        regions: regions.map(({ thumbKey, ...region }) => ({ ...region, thumbUrl: `${assetsPath}${thumbKey}` })),
      })),
    analysis: analysis
      ? {
          palette: analysis.tokens.palette ?? [],
          fonts: analysis.tokens.fonts ?? [],
          tech: analysis.tech,
          mode: analysis.mode,
        }
      : null,
    generated:
      analysis?.model && analysis.tags && analysis.description && analysis.layoutSummary
        ? {
            model: analysis.model,
            version: analysis.version,
            createdAt: analysis.createdAt,
            tags: analysis.tags,
            macrostructure: analysis.macrostructure,
            description: analysis.description,
            layoutSummary: analysis.layoutSummary,
          }
        : null,
    analysisJob: latestJob ?? null,
    analysisEnabled: analysisEnabled(),
    similar,
  };
}

/**
 * "Neu analysieren": queues a new AI analysis of the reference, unless one
 * is already waiting or running. "disabled" without ANTHROPIC_API_KEY, null
 * if the slug is unknown.
 */
export async function requestAnalysis(slug: string): Promise<"queued" | "disabled" | null> {
  const reference = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
  if (!reference) return null;
  if (!analysisEnabled()) return "disabled";

  const open = await getDb().query.importJobs.findFirst({
    columns: { id: true },
    where: and(
      eq(importJobs.referenceId, reference.id),
      eq(importJobs.kind, "analysis"),
      inArray(importJobs.status, ["queued", "processing"]),
    ),
  });
  if (!open) await getDb().insert(importJobs).values(analysisJob(reference.id, "owner"));
  return "queued";
}

/** Per field of the edit form, why it was rejected. */
export type ReferenceEditErrors = Partial<Record<keyof z.input<typeof referenceFields>, string[]>>;

/**
 * Saves the detail view's edit form (`title`, `sourceUrl`, `attribution`,
 * `takeNote`, `avoidNote`, `focus` and `device` as strings, `tags` as a list; an empty
 * list clears them). Fields left out stay as they are, so an inline edit of
 * one field sends only that one. The slug stays as it is, so links and
 * agents' slugs keep working after a new title. Queues a refresh of the
 * embedding, since title, notes and tags are part of it. Answers German
 * messages per field when the input is rejected, or null if the slug is unknown.
 */
export async function editReference(
  slug: string,
  input: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; errors: ReferenceEditErrors } | null> {
  const parsed = referenceFields.partial().safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const fields = parsed.data;
  const updated = await getDb().transaction(async (tx) => {
    const reference = (
      await tx
        .update(references)
        .set({ ...fields, ...(fields.sourceUrl !== undefined && { siteHost: siteHostOf(fields.sourceUrl) }) })
        .where(eq(references.slug, slug))
        .returning({ id: references.id, curationStatus: references.curationStatus })
    ).at(0);
    // An archived reference has no embedding; it gets one back when it leaves the archive.
    if (reference && reference.curationStatus !== "archived") await queueEmbedding(tx, reference.id, "edit");
    return reference !== undefined;
  });
  return updated ? { ok: true } : null;
}

export const siteHostOf = (sourceUrl: string | null) => (sourceUrl ? new URL(sourceUrl).hostname : null);

/**
 * Every tag in use, each once, the most used first (ties alphabetically):
 * the tag input's suggestions. Archived references count too.
 */
export async function listTagSuggestions(): Promise<string[]> {
  const rows = await getDb().execute<{ tag: string }>(
    sql`select tag from ${references}, unnest(${references.tags}) as tag group by tag order by count(*) desc, tag`,
  );
  return rows.map((row) => row.tag);
}

/** Marks or unmarks a reference as favorite. False if the slug is unknown. */
export async function setFavorite(slug: string, isFavorite: boolean): Promise<boolean> {
  const updated = await getDb()
    .update(references)
    .set({ isFavorite })
    .where(eq(references.slug, slug))
    .returning({ id: references.id });
  return updated.length > 0;
}

/**
 * Moves a reference to `draft`, `approved` or `archived`. Only approved
 * references reach MCP; the catalogue is loaded per request, so the change
 * shows on the agent's next call. Archiving deletes the embedding, so the
 * reference drops out of every similarity result; leaving the archive
 * queues a new one. False if the slug is unknown.
 */
export async function setStatus(slug: string, status: CurationStatus): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    // Locked, so a running embedding job stores its vector before or after this change, never across it.
    const current = (
      await tx
        .select({ id: references.id, status: references.curationStatus })
        .from(references)
        .where(eq(references.slug, slug))
        .for("update")
    ).at(0);
    if (!current) return false;
    await tx.update(references).set({ curationStatus: status }).where(eq(references.id, current.id));
    if (status === "archived") await tx.delete(referenceEmbeddings).where(eq(referenceEmbeddings.referenceId, current.id));
    else if (current.status === "archived") await queueEmbedding(tx, current.id, "restore");
    return true;
  });
}

/**
 * Deletes a reference for good: every stored image (original, preview and
 * thumbnail of each capture, crop and small version of each region), then
 * its row; captures, regions, analyses and the embedding go with it by cascade.
 * Images go first, so a failed attempt leaves the reference in place and a
 * retry finishes the job instead of leaving files nobody points to. False if
 * the slug is unknown.
 */
export async function removeReference(slug: string): Promise<boolean> {
  const reference = await getDb().query.references.findFirst({
    columns: { id: true },
    where: eq(references.slug, slug),
    with: {
      captures: { columns: { assetKey: true, thumbKey: true, variants: true } },
      regions: { columns: { cropKey: true, thumbKey: true } },
    },
  });
  if (!reference) return false;

  const keys = new Set([
    ...reference.captures.flatMap(({ assetKey, thumbKey, variants }) => [
      assetKey,
      thumbKey,
      variants.preview.key,
      variants.thumb.key,
    ]),
    ...reference.regions.flatMap(({ cropKey, thumbKey }) => [cropKey, thumbKey]),
  ]);
  const storage = getStorage();
  await Promise.all([...keys].map((key) => storage.delete(key)));
  // Kits keep the colours taken from it; their origin then reads "aus einer gelöschten Referenz".
  await getDb().transaction(async (tx) => {
    await forgetSourceReference(tx, reference.id);
    await tx.delete(references).where(eq(references.id, reference.id));
  });
  return true;
}

/** A URL slug from the title; a short random suffix only when the plain one is taken. */
export async function freeSlug(title: string): Promise<string> {
  const base = slugify(title) || "referenz";
  const taken = await getDb().query.references.findFirst({
    columns: { id: true },
    where: eq(references.slug, base),
  });
  return taken ? withRandomSuffix(base) : base;
}

