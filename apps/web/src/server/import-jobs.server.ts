import { imageDiagnostics } from "./image-diagnostics";
import * as m from "#/paraglide/messages.js";
import { issueMessage, validationRule } from "#/lib/validation";
/**
 * Import jobs: asynchronous work such as capturing a URL. The owner starts
 * and retries them (import-jobs.functions.ts); the capture worker drives them
 * over the worker API (routes/api/worker/$.ts), which calls only this module.
 * Besides URL imports, the worker captures font previews (`font_preview`,
 * queued by font-previews.server.ts).
 * `analysis` and `embedding` jobs share the table and its lease rules; the
 * web app's own job runner (job-runner.server.ts) claims and finishes them.
 *
 * States: `queued → processing → ready | failed`, separate from a reference's
 * curation status. A claim holds a job for a 5-minute lease, extended by
 * heartbeats; an expired lease sends it back to `queued` until `max_attempts`
 * claims are used up, then it fails.
 */

import { randomUUID } from "node:crypto";
import { TransactionRollbackError, and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { fontPreviews, importJobs, referenceAnalyses, referenceCaptures, references } from "@m3-inspo/db/library-schema";
import type { AnalysisTokens, ImportJobKind, UrlCaptureInput } from "@m3-inspo/db/library-schema";
import type { PageTokens, Sourced } from "@m3-inspo/shared";
import { BlockedUrlError, assertPublicUrl } from "@m3-inspo/shared/public-url";
import type { BlockReason } from "@m3-inspo/shared/public-url";
import { MODES, TYPE_ROLES } from "@m3-inspo/taxonomy";
import { z } from "zod";
import { maxTitleLength, maxUploadBytes } from "#/lib/image-limits";
import { prepareImage } from "./image.server";
import {
  analysisEnabled,
  analysisJob,
  deleteFiles,
  freeSlug,
  queueEmbedding,
  referenceFields,
  siteHostOf,
  storeCapture,
} from "./library.server";
import { getStorage } from "./storage.server";

/** What the owner sends to start a URL import: the page, plus the upload sheet's optional fields. */
const urlImport = referenceFields.pick({ takeNote: true, avoidNote: true, tags: true }).extend({
  requestId: z.uuid(),
  url: referenceFields.shape.sourceUrl.pipe(
    z
      .string()
      .refine((value) => !URL.parse(value)?.username && !URL.parse(value)?.password, validationRule({ code: "url_credentials" })),
  ),
  title: z
    .string()
    .trim()
    .max(maxTitleLength),
  /** The owner saw the duplicate warning and imports anyway. */
  confirmDuplicate: z.boolean(),
});

/** Why the URL guard refused an address, for the owner. An unresolvable name is left to the worker. */
const blockedReasons: Record<Exclude<BlockReason, "unresolvable">, string> = {
  get invalid() { return m.url_invalid(); },
  get scheme() { return m.validation_web_address(); },
  get credentials() { return m.validation_url_credentials(); },
  get port() { return m.url_ports(); },
  get host() { return m.url_internal_host(); },
  get "private-address"() { return m.url_private_address(); },
};

/** The URL guard's refusal in the owner's words, or null if the address may be imported. */
export async function blockedReason(url: string): Promise<string | null> {
  try {
    await assertPublicUrl(url);
    return null;
  } catch (error) {
    if (!(error instanceof BlockedUrlError)) throw error;
    // A name that does not resolve here may still be a typo or a hiccup: the worker checks again and reports it.
    return error.reason === "unresolvable" ? null : blockedReasons[error.reason];
  }
}

/** Query parameters that only track where a visitor came from. */
const trackingParameter = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref)$/i;

/**
 * A page's identity for duplicate warnings: host without "www." and path
 * without trailing slash, plus the query without tracking parameters. Scheme
 * and fragment do not count.
 */
function pageKey(url: string): string {
  const parsed = URL.parse(url);
  if (!parsed) return url;
  const query = new URLSearchParams([...parsed.searchParams].filter(([name]) => !trackingParameter.test(name)));
  query.sort();
  const search = query.size > 0 ? `?${query}` : "";
  return `${parsed.host.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${search}`;
}

/** What already exists for a page: references with the same page and jobs still waiting or running for it. */
export type Duplicate = { references: { slug: string; title: string }[]; openJobs: number };

/** References and open jobs for the page at `url` (compared by `pageKey`), or null if there are none. */
async function findDuplicate(url: string): Promise<Duplicate | null> {
  const key = pageKey(url);
  const host = new URL(url).hostname.replace(/^www\./, "");
  const [candidates, openJobs] = await Promise.all([
    getDb().query.references.findMany({
      columns: { slug: true, title: true, sourceUrl: true },
      where: inArray(references.siteHost, [host, `www.${host}`]),
      orderBy: [desc(references.createdAt)],
    }),
    getDb()
      .select({ input: importJobs.input })
      .from(importJobs)
      .where(and(eq(importJobs.kind, "url_capture"), inArray(importJobs.status, ["queued", "processing"]))),
  ]);
  const same = candidates.filter((reference) => reference.sourceUrl && pageKey(reference.sourceUrl) === key);
  const running = openJobs.filter((job) => "url" in job.input && pageKey(job.input.url) === key).length;
  if (same.length === 0 && running === 0) return null;
  return { references: same.map(({ slug, title }) => ({ slug, title })), openJobs: running };
}

type QueueResult = { ok: true; jobId: string } | { ok: false; reason: string; duplicate?: Duplicate };

/**
 * Queues a `url_capture` job from the upload page's form (`requestId`, `url`,
 * `title`, `takeNote`, `avoidNote` as strings, `tags` as a list,
 * `confirmDuplicate` as a flag). Sending the same `requestId` again returns
 * the job it created the first time. Answers a localized reason when the input
 * is rejected: an address the URL guard refuses, or (with `duplicate`) a
 * page that is already in the library or being imported, until the owner
 * confirms it with `confirmDuplicate`.
 */
export async function queueUrlImport(input: Record<string, unknown>): Promise<QueueResult> {
  const parsed = urlImport.safeParse(input);
  if (!parsed.success) return { ok: false, reason: issueMessage(parsed.error.issues[0]) };
  const { requestId, url, title, takeNote, avoidNote, tags, confirmDuplicate } = parsed.data;

  // A resent form gets its job back before any check, so its own job does not count as a duplicate.
  const sent = await jobByRequest(requestId);
  if (sent) return { ok: true, jobId: sent };

  const blocked = await blockedReason(url);
  if (blocked) return { ok: false, reason: blocked };
  if (!confirmDuplicate) {
    const duplicate = await findDuplicate(url);
    if (duplicate) {
      const reason =
        duplicate.references.length > 0 ? m.url_already_in_library() : m.url_already_importing();
      return { ok: false, reason, duplicate };
    }
  }

  // Only filled fields go into the input; the reference starts with them once the capture is done.
  const jobInput: UrlCaptureInput = {
    url,
    ...(title && { title }),
    ...(takeNote && { takeNote }),
    ...(avoidNote && { avoidNote }),
    ...(tags.length > 0 && { tags }),
  };
  const created = (
    await getDb()
      .insert(importJobs)
      .values({ kind: "url_capture", requestId, input: jobInput })
      .onConflictDoNothing({ target: importJobs.requestId })
      .returning({ id: importJobs.id })
  ).at(0);
  if (created) return { ok: true, jobId: created.id };

  // The same request, sent twice at once: the other one inserted it.
  const existing = await jobByRequest(requestId);
  if (!existing) throw new Error("Import job vanished after a conflicting insert.");
  return { ok: true, jobId: existing };
}

/** The id of the job queued with `requestId`, if any. */
async function jobByRequest(requestId: string): Promise<string | undefined> {
  const job = await getDb().query.importJobs.findFirst({
    columns: { id: true },
    where: eq(importJobs.requestId, requestId),
  });
  return job?.id;
}

/**
 * The job list: the newest 100 URL imports with their URL and, once ready,
 * the created reference's slug. Analysis jobs show on their reference's
 * detail page instead.
 */
export async function listJobs() {
  await releaseExpiredLeases();
  const rows = await getDb()
    .select({
      id: importJobs.id,
      kind: importJobs.kind,
      status: importJobs.status,
      stage: importJobs.stage,
      attempts: importJobs.attempts,
      maxAttempts: importJobs.maxAttempts,
      input: importJobs.input,
      errorMessage: importJobs.errorMessage,
      createdAt: importJobs.createdAt,
      updatedAt: importJobs.updatedAt,
      referenceSlug: references.slug,
    })
    .from(importJobs)
    .leftJoin(references, eq(references.id, importJobs.referenceId))
    .where(eq(importJobs.kind, "url_capture"))
    .orderBy(desc(importJobs.createdAt))
    .limit(100);
  return rows.flatMap(({ input, ...job }) => ("url" in input ? [{ ...job, url: input.url, title: input.title ?? null }] : []));
}

/** How long a claim holds a job without a heartbeat. */
export const leaseInterval = sql`interval '5 minutes'`;

const expiredLease = and(eq(importJobs.status, "processing"), lte(importJobs.leaseExpiresAt, sql`now()`));

/**
 * Sends jobs whose lease ran out back to the queue, or fails them once every
 * attempt is used up, and drops what their last holder uploaded. Runs before
 * each claim and each look at the job list, so no timer is needed.
 */
async function releaseExpiredLeases() {
  const cleared = { stage: null, leaseExpiresAt: null };
  const requeued = await getDb()
    .update(importJobs)
    .set({ ...cleared, status: "queued" })
    .where(and(expiredLease, lt(importJobs.attempts, importJobs.maxAttempts)))
    .returning({ id: importJobs.id });
  const failed = await getDb()
    .update(importJobs)
    .set({ ...cleared, status: "failed", errorMessage: "Der Worker hat sich bei keinem Versuch zurückgemeldet." })
    .where(and(expiredLease, gte(importJobs.attempts, importJobs.maxAttempts)))
    .returning({ id: importJobs.id });
  await Promise.all([...requeued, ...failed].map(({ id }) => getStorage().deleteFolder(stagingFolder(id))));
}

/** The kinds the capture worker takes; it names those it knows when it claims. */
export const workerKinds = ["url_capture", "font_preview"] as const satisfies ImportJobKind[];

/**
 * Hands the oldest queued job of one of `kinds` to its worker, or
 * null: `url_capture` and `font_preview` jobs to the capture worker,
 * `analysis` and `embedding` jobs to the web app's job runner. The job
 * is `processing` with a fresh 5-minute lease; `attempt` is the holder's
 * proof for every later call about it. `FOR UPDATE SKIP LOCKED` keeps two
 * parallel claims from getting the same job.
 */
export async function claimJob(kinds: readonly ImportJobKind[]) {
  await releaseExpiredLeases();
  const next = getDb()
    .select({ id: importJobs.id })
    .from(importJobs)
    .where(
      and(
        eq(importJobs.status, "queued"),
        inArray(importJobs.kind, kinds),
        lt(importJobs.attempts, importJobs.maxAttempts),
      ),
    )
    .orderBy(asc(importJobs.createdAt))
    .limit(1)
    .for("update", { skipLocked: true });
  const claimed = await getDb()
    .update(importJobs)
    .set({
      status: "processing",
      stage: null,
      attempts: sql`${importJobs.attempts} + 1`,
      leaseExpiresAt: sql`now() + ${leaseInterval}`,
      heartbeatAt: sql`now()`,
    })
    .where(eq(importJobs.id, sql`(${next})`))
    .returning({
      id: importJobs.id,
      kind: importJobs.kind,
      attempt: importJobs.attempts,
      leaseExpiresAt: importJobs.leaseExpiresAt,
      input: importJobs.input,
    });
  return claimed.at(0) ?? null;
}

/**
 * Why the worker API turns a call down; the route answers 400, 404, 409 and
 * 422 respectively. `message` is English, for the worker's log.
 */
export type Refusal = { ok: false; problem: "invalid" | "notFound" | "conflict" | "rejected"; message: string };
type Outcome<T> = ({ ok: true } & T) | Refusal;

const refuse = (problem: Refusal["problem"], message: string): Refusal => ({ ok: false, problem, message });

/** The number `claimJob` handed out, sent back with every call about the job. */
const attempt = z.number().int().positive();

/**
 * The condition for "the holder of `attempt` still holds job `id`": it is a
 * job of one of `kinds` (by default the capture worker's) in `processing`,
 * claimed `attempt` times, with a running lease. A worker whose lease ran
 * out, or whose job was claimed again since, no longer holds it. `id` must
 * be a UUID (the route checks).
 */
export const heldBy = (id: string, holder: number, kinds: readonly ImportJobKind[] = workerKinds) =>
  and(
    eq(importJobs.id, id),
    inArray(importJobs.kind, kinds),
    eq(importJobs.status, "processing"),
    eq(importJobs.attempts, holder),
    gt(importJobs.leaseExpiresAt, sql`now()`),
  );

/** Why a call about job `id` found it not held: unknown to the worker, or no longer this holder's. */
async function notHeld(id: string): Promise<Refusal> {
  const job = await getDb().query.importJobs.findFirst({
    columns: { id: true },
    where: and(eq(importJobs.id, id), inArray(importJobs.kind, workerKinds)),
  });
  return job
    ? refuse("conflict", "The job is not held by this attempt (lease expired, claimed again or finished).")
    : refuse("notFound", "No such job.");
}

const heartbeat = z.object({
  attempt,
  /** Where the job stands, e.g. "capturing"; shown in the job list. */
  stage: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,39}$/, "A stage is a short lowercase word such as capturing.")
    .optional(),
});

/** Extends the holder's lease by 5 minutes and records the stage it reports. */
export async function renewLease(id: string, body: unknown): Promise<Outcome<{ leaseExpiresAt: Date }>> {
  const parsed = heartbeat.safeParse(body);
  if (!parsed.success) return refuse("invalid", z.prettifyError(parsed.error));
  const { attempt: holder, stage } = parsed.data;

  const renewed = (
    await getDb()
      .update(importJobs)
      .set({ leaseExpiresAt: sql`now() + ${leaseInterval}`, heartbeatAt: sql`now()`, ...(stage && { stage }) })
      .where(heldBy(id, holder))
      .returning({ leaseExpiresAt: importJobs.leaseExpiresAt })
  ).at(0);
  if (!renewed?.leaseExpiresAt) return notHeld(id);
  return { ok: true, leaseExpiresAt: renewed.leaseExpiresAt };
}

/** At most this many captures per job: desktop and mobile, hero and full page. */
const maxCaptures = 4;
const uploadUrlSeconds = 10 * 60;

/**
 * The job's staging folder: uploads wait here until `completeJob` checks
 * them, one subfolder per attempt, so a later attempt never picks up what an
 * earlier holder uploaded.
 */
const stagingFolder = (id: string) => `staging/import-jobs/${id}/`;
const stagingKey = (id: string, holder: number, uploadId: string) => `${stagingFolder(id)}${holder}/${uploadId}`;
const stagingKeyPattern = /^staging\/import-jobs\/([0-9a-f-]{36})\/(\d+)\/[0-9a-f-]{36}$/;

/**
 * Whether an upload to storage key `key` may land: "open" while the attempt
 * it was issued for still holds its job, "closed" after that, "unknown" for
 * keys that are no staged upload. For the folder storage's upload route; S3
 * uploads go straight to the bucket, and `completeJob` reads only the
 * holder's own attempt folder.
 */
export async function stagedUploadState(key: string): Promise<"open" | "closed" | "unknown"> {
  const [, id = "", holder = ""] = stagingKeyPattern.exec(key) ?? [];
  if (!id) return "unknown";
  const held = await getDb().select({ id: importJobs.id }).from(importJobs).where(heldBy(id, Number(holder)));
  return held.length > 0 ? "open" : "closed";
}

const uploadRequest = z.object({ attempt, count: z.number().int().min(1).max(maxCaptures) });

/**
 * Issues `count` upload targets for the holder's captures: a PUT URL each,
 * pointing into the job's staging folder. Uploads become captures only when
 * `completeJob` names and checks them.
 */
export async function createUploadTargets(
  id: string,
  body: unknown,
): Promise<Outcome<{ uploads: { id: string; url: string; method: "PUT" }[] }>> {
  const parsed = uploadRequest.safeParse(body);
  if (!parsed.success) return refuse("invalid", z.prettifyError(parsed.error));

  const held = await getDb().select({ id: importJobs.id }).from(importJobs).where(heldBy(id, parsed.data.attempt));
  if (held.length === 0) return notHeld(id);

  const uploads = await Promise.all(
    Array.from({ length: parsed.data.count }, async () => {
      const uploadId = randomUUID();
      const url = await getStorage().uploadUrl(stagingKey(id, parsed.data.attempt, uploadId), uploadUrlSeconds);
      return { id: uploadId, url, method: "PUT" as const };
    }),
  );
  return { ok: true, uploads };
}

/**
 * Design values the worker read from the page, with generous limits: the
 * worker sends fewer, and anything beyond them is refused, not cut.
 */
const pageTokens: z.ZodType<PageTokens> = z.strictObject({
  palette: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/, "A palette colour is #rrggbb in lowercase."))
    .max(16),
  fonts: z.array(z.string().trim().min(1).max(100)).max(16),
  typeRamp: z
    .array(
      z.strictObject({
        role: z.enum(TYPE_ROLES),
        family: z.string().max(100),
        sizePx: z.number().int().min(1).max(500),
        weight: z.number().int().min(1).max(1000),
        lineHeight: z.number().min(0).max(20),
        letterSpacing: z.string().max(30),
      }),
    )
    .max(12),
  spacingScale: z.array(z.number().int().min(0).max(2000)).max(40),
  radiusScale: z.array(z.number().int().min(0).max(2000)).max(20),
  containerWidth: z.number().int().min(1).max(10_000).nullable(),
  cssVariables: z
    .record(z.string().regex(/^--[\w-]{1,98}$/, "A CSS variable name starts with --."), z.string().max(200))
    .refine((variables) => Object.keys(variables).length <= 300, "At most 300 CSS variables."),
});

/**
 * The worker's result. Only what the web app stores; unknown fields are
 * refused, so the worker notices when it sends something that gets lost.
 */
const completion = z.strictObject({
  attempt,
  /** The page's <title>; names the draft when the owner gave no title. */
  pageTitle: z
    .string()
    .max(2000)
    .transform((title) => title.trim().slice(0, maxTitleLength))
    .optional(),
  captures: z
    .array(
      z.strictObject({
        uploadId: z.uuid(),
        viewport: z.enum(["desktop", "mobile"]),
        kind: z.enum(["hero", "full"]),
      }),
    )
    .min(1)
    .max(maxCaptures)
    .refine((captures) => new Set(captures.map((capture) => capture.uploadId)).size === captures.length, "Each upload may be used once."),
  /** Read from the page's DOM; stored as the reference's first analysis, every value with `source: "dom"`. */
  tokens: pageTokens.optional(),
  /** Detected technology, e.g. "Next.js". */
  tech: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  mode: z.enum(MODES).optional(),
});

const fromDom = <T>(value: T): Sourced<T> => ({ value, source: "dom" });

/**
 * The worker's values as analysis tokens, each marked as read from the DOM.
 * The worker cannot claim another provenance. Fields it found nothing for
 * stay absent.
 */
function domTokens(tokens: PageTokens): AnalysisTokens {
  const variables = Object.entries(tokens.cssVariables);
  return {
    ...(tokens.palette.length > 0 && { palette: tokens.palette.map(fromDom) }),
    ...(tokens.fonts.length > 0 && { fonts: tokens.fonts.map(fromDom) }),
    ...(tokens.typeRamp.length > 0 && { typeRamp: tokens.typeRamp.map(fromDom) }),
    ...(tokens.spacingScale.length > 0 && { spacingScale: tokens.spacingScale.map(fromDom) }),
    ...(tokens.radiusScale.length > 0 && { radiusScale: tokens.radiusScale.map(fromDom) }),
    ...(tokens.containerWidth !== null && { containerWidth: fromDom(tokens.containerWidth) }),
    ...(variables.length > 0 && {
      cssVariables: Object.fromEntries(variables.map(([name, value]) => [name, fromDom(value)])),
    }),
  };
}

/** A staged upload's bytes, or why it cannot be used. */
async function readStaged(key: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }> {
  const object = await getStorage().read(key);
  if (!object) return { ok: false, reason: "not uploaded" };
  if ((object.size ?? 0) > maxUploadBytes) {
    await object.body.cancel();
    return { ok: false, reason: imageDiagnostics.tooLarge };
  }
  return { ok: true, bytes: new Uint8Array(await new Response(object.body).arrayBuffer()) };
}

/**
 * Finishes the holder's job: checks and re-encodes every named upload like a
 * normal image upload. A `font_preview` job stores its one capture as the
 * preview (`completeFontPreview`); a `url_capture` job creates the reference as a draft with these
 * captures, the owner's title, notes and tags from the job input and, if the
 * worker read any, the page's design values as its first analysis, marks the
 * job ready and queues the AI analysis and the embedding (each if on).
 * Nothing is created if any capture is refused; the job stays with its
 * holder, who may report the failure.
 */
export async function completeJob(id: string, body: unknown): Promise<Outcome<{ referenceSlug?: string }>> {
  const parsed = completion.safeParse(body);
  if (!parsed.success) return refuse("invalid", z.prettifyError(parsed.error));
  const { attempt: holder, pageTitle, captures, tokens, tech, mode } = parsed.data;

  const job = (
    await getDb().select({ kind: importJobs.kind, input: importJobs.input }).from(importJobs).where(heldBy(id, holder))
  ).at(0);
  if (!job) return notHeld(id);
  if (job.kind === "font_preview") {
    const [capture] = captures;
    if (captures.length > 1 || capture.viewport !== "desktop" || capture.kind !== "hero") {
      return refuse("invalid", "A font preview is exactly one desktop hero capture.");
    }
    return completeFontPreview(id, holder, capture.uploadId);
  }
  if (!("url" in job.input)) return notHeld(id);

  // Every capture is checked before anything is stored. One after another, so one large image is decoded at a time.
  const images = [];
  for (const [index, capture] of captures.entries()) {
    const staged = await readStaged(stagingKey(id, holder, capture.uploadId));
    if (!staged.ok) return refuse("rejected", `Capture ${index + 1} (${capture.uploadId}): ${staged.reason}`);
    const check = await prepareImage(staged.bytes);
    if (!check.ok) return refuse("rejected", `Capture ${index + 1} (${capture.uploadId}): ${imageDiagnostics[check.reason]}`);
    images.push({ image: check.image, placement: { viewport: capture.viewport, kind: capture.kind } });
  }

  const { input } = job;
  const referenceId = randomUUID();
  const title = input.title ?? (pageTitle || new URL(input.url).hostname);
  const stored: Awaited<ReturnType<typeof storeCapture>>[] = [];
  try {
    for (const { image, placement } of images) stored.push(await storeCapture(referenceId, image, placement));
    const slug = await freeSlug(title);
    await getDb().transaction(async (tx) => {
      await tx.insert(references).values({
        id: referenceId,
        slug,
        title,
        sourceKind: "url",
        sourceUrl: input.url,
        siteHost: siteHostOf(input.url),
        curationStatus: "draft",
        takeNote: input.takeNote ?? null,
        avoidNote: input.avoidNote ?? null,
        tags: input.tags ?? [],
      });
      await tx.insert(referenceCaptures).values(stored.map((capture) => capture.row));
      if (tokens || tech || mode) {
        await tx.insert(referenceAnalyses).values({
          referenceId,
          version: 1,
          tokens: tokens ? domTokens(tokens) : {},
          tech: tech ?? [],
          mode: mode ?? null,
          pageTitle: pageTitle || null,
          generatedBy: "capture",
        });
      }
      const finished = await tx
        .update(importJobs)
        .set({ status: "ready", stage: null, leaseExpiresAt: null, referenceId })
        .where(heldBy(id, holder))
        .returning({ id: importJobs.id });
      // The lease ran out while the images were processed: the job belongs to someone else now.
      if (finished.length === 0) tx.rollback();
      if (analysisEnabled()) await tx.insert(importJobs).values(analysisJob(referenceId, "import"));
      await queueEmbedding(tx, referenceId, "import");
    });
    await getStorage().deleteFolder(stagingFolder(id));
    return { ok: true, referenceSlug: slug };
  } catch (error) {
    await deleteFiles(stored.flatMap((capture) => capture.keys));
    if (error instanceof TransactionRollbackError) return notHeld(id);
    throw error;
  }
}

/**
 * Stores the holder's upload as the font preview whose job this is (as WebP,
 * at most 1600 px wide), marks the job ready and deletes the image it
 * replaces. Nothing changes if the upload is refused or the lease ran out.
 */
async function completeFontPreview(id: string, holder: number, uploadId: string): Promise<Outcome<object>> {
  const staged = await readStaged(stagingKey(id, holder, uploadId));
  if (!staged.ok) return refuse("rejected", `Capture 1 (${uploadId}): ${staged.reason}`);
  const check = await prepareImage(staged.bytes);
  if (!check.ok) return refuse("rejected", `Capture 1 (${uploadId}): ${imageDiagnostics[check.reason]}`);

  const { preview } = check.image;
  const key = `font-previews/${id}/${randomUUID()}.webp`;
  await getStorage().write(key, preview.data, "image/webp");
  try {
    const replaced = await getDb().transaction(async (tx) => {
      const finished = await tx
        .update(importJobs)
        .set({ status: "ready", stage: null, leaseExpiresAt: null })
        .where(heldBy(id, holder))
        .returning({ id: importJobs.id });
      if (finished.length === 0) tx.rollback();
      const before = (await tx.select({ key: fontPreviews.imageKey }).from(fontPreviews).where(eq(fontPreviews.jobId, id))).at(0);
      await tx
        .update(fontPreviews)
        .set({ imageKey: key, imageWidth: preview.width, imageHeight: preview.height, capturedAt: new Date() })
        .where(eq(fontPreviews.jobId, id));
      return before?.key;
    });
    if (replaced) await deleteFiles([replaced]);
    await getStorage().deleteFolder(stagingFolder(id));
    return { ok: true };
  } catch (error) {
    await deleteFiles([key]);
    if (error instanceof TransactionRollbackError) return notHeld(id);
    throw error;
  }
}

const failure = z.object({ attempt, error: z.string().max(20_000) });

/**
 * Ends the holder's job as failed, with the reported error cleaned by
 * `sanitizeError`. Final: only the owner puts it back into the queue
 * (`retryJob`).
 */
export async function failJob(id: string, body: unknown): Promise<Outcome<object>> {
  const parsed = failure.safeParse(body);
  if (!parsed.success) return refuse("invalid", z.prettifyError(parsed.error));

  const failed = await getDb()
    .update(importJobs)
    .set({ status: "failed", stage: null, leaseExpiresAt: null, errorMessage: sanitizeError(parsed.data.error) })
    .where(heldBy(id, parsed.data.attempt))
    .returning({ id: importJobs.id });
  if (failed.length === 0) return notHeld(id);
  await getStorage().deleteFolder(stagingFolder(id));
  return { ok: true };
}

const maxErrorLength = 300;
const removed = "[entfernt]";

/**
 * An error as the owner may see it in the job list. Keeps only the first
 * line (stack traces and Playwright's call logs follow on later lines), and
 * removes from it credentials, query strings and fragments of URLs, auth and
 * cookie headers up to the end of the line, the values of secret-like keys,
 * and long token-like strings (base64 included).
 * At most 300 characters.
 */
export function sanitizeError(raw: string): string {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const cleaned = firstLine
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, "$1")
    // A header's value runs to the end of the line, e.g. every cookie in `Cookie: a=1; b=2`.
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*:.*$/i, `$1: ${removed}`)
    .replace(
      /\b(authorization|api[_-]?key|token|secret|password)\b\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+/gi,
      `$1: ${removed}`,
    )
    .replace(/\b(bearer|basic)\s+\S+/gi, `$1 ${removed}`)
    // Long runs of token characters, base64 included.
    .replace(/[\w+/=-]{32,}/g, removed)
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Unbekannter Fehler.";
  return cleaned.length > maxErrorLength ? `${cleaned.slice(0, maxErrorLength - 1)}…` : cleaned;
}

/** How many more claims a retry grants. */
const attemptsPerRetry = 3;

/**
 * "Erneut versuchen": puts a failed job back into the queue with three more
 * attempts: the owner decided to try again, so earlier bad luck does not
 * count against it. `attempts` keeps counting and is never reset, so every
 * claim gets a number no earlier holder had, and a worker still busy with a
 * run from before the retry holds nothing. False if the job is not failed
 * (any more).
 */
export async function retryJob(id: string): Promise<boolean> {
  const retried = await getDb()
    .update(importJobs)
    .set({
      status: "queued",
      stage: null,
      maxAttempts: sql`${importJobs.attempts} + ${attemptsPerRetry}`,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorMessage: null,
    })
    .where(and(eq(importJobs.id, id), eq(importJobs.status, "failed")))
    .returning({ id: importJobs.id });
  if (retried.length === 0) return false;
  await getStorage().deleteFolder(stagingFolder(id));
  return true;
}
