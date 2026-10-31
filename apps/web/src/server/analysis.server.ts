/**
 * The AI analysis: `analysis` jobs, run one at a time inside the web app by
 * the job runner (job-runner.server.ts). The capture worker never sees them;
 * it holds neither an Anthropic key nor read access to images
 * (docs/umsetzungsplan.md, Ort der KI-Analyse).
 *
 * A job (queued after an upload, after a URL import and by "Neu
 * analysieren", see library.server.ts) runs like this: claim it with a
 * lease, read up to three captures from storage and shrink them to the
 * model's image limits, ask the vision model, check its answer, then store
 * a new analysis version, queue the embedding refresh its texts call for
 * (embedding.server.ts) and mark the job ready in one transaction.
 *
 * Logs name the job, the stage, the time taken and an error's class, never
 * screenshots, notes, prompts or answers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { importJobs, referenceAnalyses } from "@m3-inspo/db/library-schema";
import type { AnalysisTokens, CaptureVariants } from "@m3-inspo/db/library-schema";
import type { Sourced } from "@m3-inspo/shared";
import sharp from "sharp";
import { analysisAnswer, UnusableAnswerError } from "./analysis-model.server";
import type { AnalysisAnswer, AnalysisImage, VisionModel } from "./analysis-model.server";
import { claimJob, heldBy, leaseInterval, sanitizeError } from "./import-jobs.server";
import { queueEmbedding } from "./library.server";
import { getStorage } from "./storage.server";

/** How often a running job renews its 5-minute lease. */
const heartbeatMs = 30_000;

/**
 * The captures the model sees, in this order, at most three: the desktop
 * first view, the mobile first view and the top of the desktop page, or the
 * uploaded image.
 */
const imageLabels: Record<string, string> = {
  "desktop/hero": "Desktop, first viewport:",
  "mobile/hero": "Mobile, first viewport:",
  "desktop/full": "Desktop, full page (top part):",
  "upload/original": "Uploaded screenshot:",
  "mobile/full": "Mobile, full page (top part):",
};
const imageOrder = Object.keys(imageLabels);
const maxImages = 3;

/**
 * Image limits for the model: at most 1600 px wide (a desktop shot keeps its
 * size) and 2576 px tall, the API's long-edge limit. A full page is cut to
 * its top part instead of being shrunk until nothing is legible.
 */
const maxImageWidth = 1600;
const maxImageHeight = 2576;

/** A stored capture as JPEG base64 within the model's image limits. */
async function visionImage(key: string): Promise<string> {
  const object = await getStorage().read(key);
  if (!object) throw new Error("A capture is missing in storage.");
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  const { data, info } = await sharp(bytes)
    .resize({ width: maxImageWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const jpeg = await sharp(data)
    .extract({ left: 0, top: 0, width: info.width, height: Math.min(info.height, maxImageHeight) })
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg.toString("base64");
}

type Capture = { viewport: string; kind: string; variants: CaptureVariants };

/** The captures to show the model (see `imageLabels`), read from their preview variants. */
async function visionImages(captures: Capture[]): Promise<AnalysisImage[]> {
  const chosen = imageOrder
    .map((placement) => captures.find((capture) => `${capture.viewport}/${capture.kind}` === placement))
    .filter((capture) => capture !== undefined)
    .slice(0, maxImages);
  // One after another, so one large image is decoded at a time.
  const images: AnalysisImage[] = [];
  for (const capture of chosen) {
    images.push({
      label: imageLabels[`${capture.viewport}/${capture.kind}`] ?? "Screenshot:",
      base64: await visionImage(capture.variants.preview.key),
    });
  }
  return images;
}

/**
 * The design values of a new version: what was measured (or entered) before
 * is carried over, earlier estimates are replaced, and the model's estimates
 * fill only fields nothing measured, each marked `vision` with its
 * confidence. An image reference has no DOM, so no `dom` value survives on
 * it, and its fonts are style estimates, never family names.
 */
function nextTokens(previous: AnalysisTokens, answer: AnalysisAnswer, sourceKind: "url" | "image"): AnalysisTokens {
  const keep = (token: Sourced<unknown>) => token.source !== "vision" && !(sourceKind === "image" && token.source === "dom");
  const kept = <T>(values: Sourced<T>[] | undefined) => {
    const left = values?.filter(keep) ?? [];
    return left.length > 0 ? left : undefined;
  };
  const variables = Object.entries(previous.cssVariables ?? {}).filter(([, token]) => keep(token));
  const estimated = <T>(values: T[]) => (values.length > 0 ? values : undefined);

  return {
    palette:
      kept(previous.palette) ??
      estimated(answer.palette.map(({ hex, confidence }) => ({ value: hex, source: "vision" as const, confidence }))),
    fonts:
      kept(previous.fonts) ??
      estimated(answer.fontStyles.map(({ style, confidence }) => ({ value: style, source: "vision" as const, confidence }))),
    typeRamp: kept(previous.typeRamp),
    spacingScale: kept(previous.spacingScale),
    radiusScale: kept(previous.radiusScale),
    containerWidth: previous.containerWidth && keep(previous.containerWidth) ? previous.containerWidth : undefined,
    cssVariables: variables.length > 0 ? Object.fromEntries(variables) : undefined,
  };
}

/**
 * Stores the answer as the reference's next analysis version, queues the
 * embedding refresh (its tags and description are part of the embedding)
 * and marks the job ready, in one transaction. Rolls back if the runner lost
 * the job's lease meanwhile. Tech and page title carry over; a URL reference
 * keeps its measured mode.
 */
async function saveAnalysis(
  job: { id: string; attempt: number },
  reference: { id: string; sourceKind: "url" | "image" },
  answer: AnalysisAnswer,
  model: string,
) {
  await getDb().transaction(async (tx) => {
    const previous = (
      await tx
        .select()
        .from(referenceAnalyses)
        .where(eq(referenceAnalyses.referenceId, reference.id))
        .orderBy(desc(referenceAnalyses.version))
        .limit(1)
    ).at(0);
    const { style, industry, components, vibe, colorWords } = answer;
    await tx.insert(referenceAnalyses).values({
      referenceId: reference.id,
      version: (previous?.version ?? 0) + 1,
      tokens: nextTokens(previous?.tokens ?? {}, answer, reference.sourceKind),
      tech: previous?.tech ?? [],
      mode: (reference.sourceKind === "url" ? previous?.mode : null) ?? answer.mode,
      pageTitle: previous?.pageTitle ?? null,
      generatedBy: "analysis",
      model,
      tags: { style, industry, components, vibe, colorWords },
      macrostructure: answer.macrostructure,
      description: answer.description,
      layoutSummary: answer.layoutSummary,
    });
    await queueEmbedding(tx, reference.id, "analysis");
    const finished = await tx
      .update(importJobs)
      .set({ status: "ready", stage: null, leaseExpiresAt: null })
      .where(heldBy(job.id, job.attempt, ["analysis"]))
      .returning({ id: importJobs.id });
    if (finished.length === 0) tx.rollback();
  });
}

/** Why the analysis failed, in the owner's words, without prompt, notes or answer. */
function failureMessage(error: unknown): string {
  if (error instanceof UnusableAnswerError) return "Die Antwort des Modells war nicht verwendbar.";
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic hat den API-Schlüssel abgelehnt.";
  if (error instanceof Anthropic.RateLimitError) return "Anthropic hat das Anfragelimit erreicht. Bitte später neu analysieren.";
  if (error instanceof Anthropic.APIConnectionError) return "Anthropic war nicht erreichbar.";
  if (error instanceof Anthropic.APIError) return `Anthropic hat mit ${error.status ?? "einem Fehler"} geantwortet: ${sanitizeError(error.message)}`;
  return sanitizeError(error instanceof Error ? error.message : String(error));
}

/** An error's class for the log, e.g. "RateLimitError 429"; never its message, which may quote input. */
function errorClass(error: unknown) {
  if (error instanceof Anthropic.APIError) return `${error.name} ${error.status ?? ""}`.trim();
  return error instanceof Error ? error.name : typeof error;
}

/** Ends the holder's job as failed with `message` for the owner. */
async function failAnalysis(job: { id: string; attempt: number }, message: string) {
  await getDb()
    .update(importJobs)
    .set({ status: "failed", stage: null, leaseExpiresAt: null, errorMessage: message })
    .where(heldBy(job.id, job.attempt, ["analysis"]));
}

/**
 * Claims the oldest queued analysis job and runs it with `vision`. False if
 * the queue was empty. A failure ends the job as failed with a message for
 * the owner ("Neu analysieren" starts a new one). When `signal` aborts
 * mid-job, the job is left as it is: its lease runs out and it is claimed
 * again.
 */
export async function runNextAnalysis(vision: VisionModel, signal?: AbortSignal): Promise<boolean> {
  const job = await claimJob(["analysis"]);
  if (!job) return false;

  const started = performance.now();
  let stage = "loading";
  const setStage = async (next: string) => {
    stage = next;
    await getDb()
      .update(importJobs)
      .set({ stage, leaseExpiresAt: sql`now() + ${leaseInterval}`, heartbeatAt: sql`now()` })
      .where(heldBy(job.id, job.attempt, ["analysis"]));
  };
  const heartbeat = setInterval(() => void setStage(stage).catch(() => {}), heartbeatMs);
  const elapsed = () => Math.round(performance.now() - started);

  try {
    const row = await getDb().query.importJobs.findFirst({
      columns: {},
      where: eq(importJobs.id, job.id),
      with: {
        reference: {
          columns: { id: true, sourceKind: true, title: true, sourceUrl: true, focus: true, takeNote: true, avoidNote: true },
          with: { captures: { columns: { viewport: true, kind: true, variants: true } } },
        },
      },
    });
    const reference = row?.reference;
    if (!reference) {
      await failAnalysis(job, "Die Referenz gibt es nicht mehr.");
      return true;
    }

    await setStage("images");
    const images = await visionImages(reference.captures);
    if (images.length === 0) {
      await failAnalysis(job, "Die Referenz hat keine Aufnahme, die sich analysieren lässt.");
      return true;
    }

    await setStage("model");
    const { captures: _captures, id: _id, ...context } = reference;
    const raw = await vision.analyze({ ...context, images }, signal);
    const answer = analysisAnswer.safeParse(raw);
    if (!answer.success) throw new UnusableAnswerError("The answer did not match the schema.");

    await setStage("saving");
    await saveAnalysis(job, reference, answer.data, vision.model);
    console.info(`[analysis] job ${job.id} ready after ${elapsed()} ms`);
  } catch (error) {
    if (signal?.aborted) {
      console.info(`[analysis] job ${job.id} left at ${stage} on shutdown after ${elapsed()} ms`);
      return true;
    }
    console.error(`[analysis] job ${job.id} failed at ${stage} after ${elapsed()} ms: ${errorClass(error)}`);
    await failAnalysis(job, failureMessage(error));
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
