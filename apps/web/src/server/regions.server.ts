/**
 * Regions ("Bereiche markieren"): the owner marks a rectangle on a capture,
 * gives it a component type and a note, and the library keeps it as a
 * region with a crop of its own (@m3-inspo/db library-schema `referenceRegions`).
 * Agents find regions through `find_components`. Server functions
 * (regions.functions.ts) call only this module.
 *
 * Type and note feed the reference's embedding, so each change queues a
 * refresh (`queueEmbedding`).
 */

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { referenceCaptures, referenceRegions, references } from "@m3-inspo/db/library-schema";
import { COMPONENT_TYPES } from "@m3-inspo/taxonomy";
import { z } from "zod";
import { maxRegionSide, minRegionSide } from "#/lib/regions";
import { maxNoteLength } from "#/lib/upload-limits";
import { cropImage } from "./image.server";
import { deleteFiles, queueEmbedding } from "./library.server";
import type { Queries } from "./library.server";
import { getStorage } from "./storage.server";

/** Type and note of a region; an empty note becomes null. Messages are for the owner. */
const regionFields = z.object({
  componentType: z.enum(COMPONENT_TYPES, "Bitte wähle einen Komponententyp."),
  note: z
    .string()
    .trim()
    .max(maxNoteLength, `Die Notiz ist zu lang (höchstens ${maxNoteLength} Zeichen).`)
    .transform((value) => value || null),
});

const side = z.number().int().min(minRegionSide, "Der Bereich ist zu klein.").max(maxRegionSide, "Der Bereich ist zu groß.");

/** A new region: the capture, the rectangle in its pixels, type and note. */
const newRegion = regionFields.extend({
  captureId: z.uuid("Unbekannte Aufnahme."),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: side,
  height: side,
});

type RegionResult = { ok: true; id: string } | { ok: false; reason: string };

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Die Angaben sind ungültig.";

/**
 * Marks a region on a capture of the reference `slug`: cuts the rectangle out
 * of the capture's full-size image, stores the crop and its small version
 * and saves the region. Answers a German reason when the input is rejected,
 * e.g. a rectangle that does not lie on the capture, or null if the slug is
 * unknown.
 */
export async function markRegion(slug: string, input: Record<string, unknown>): Promise<RegionResult | null> {
  const parsed = newRegion.safeParse(input);
  if (!parsed.success) return { ok: false, reason: firstIssue(parsed.error) };
  const { captureId, componentType, note, ...rect } = parsed.data;

  const reference = await getDb().query.references.findFirst({
    columns: { id: true },
    where: eq(references.slug, slug),
    with: {
      captures: {
        columns: { id: true, assetKey: true, width: true, height: true },
        where: eq(referenceCaptures.id, captureId),
      },
    },
  });
  if (!reference) return null;
  const capture = reference.captures.at(0);
  if (!capture) return { ok: false, reason: "Diese Aufnahme gehört nicht zur Referenz." };
  if (rect.x + rect.width > capture.width || rect.y + rect.height > capture.height) {
    return { ok: false, reason: "Der Bereich liegt nicht ganz auf der Aufnahme." };
  }

  const original = await getStorage().read(capture.assetKey);
  if (!original) throw new Error(`Capture ${capture.id} has no stored image.`);
  const { crop, thumb } = await cropImage(new Uint8Array(await new Response(original.body).arrayBuffer()), rect);

  const id = randomUUID();
  const folder = `references/${reference.id}/${capture.id}/regions/${id}`;
  const cropKey = `${folder}/crop.webp`;
  const thumbKey = `${folder}/thumb.webp`;
  const storage = getStorage();
  await Promise.all([storage.write(cropKey, crop.data, "image/webp"), storage.write(thumbKey, thumb.data, "image/webp")]);

  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(referenceRegions).values({
        id,
        referenceId: reference.id,
        captureId: capture.id,
        ...rect,
        componentType,
        note,
        cropKey,
        thumbKey,
      });
      await queueEmbeddingUnlessArchived(tx, reference.id);
    });
  } catch (error) {
    await deleteFiles([cropKey, thumbKey]);
    throw error;
  }
  return { ok: true, id };
}

/**
 * Changes a region's type and note; the rectangle and its crop stay. Answers
 * a German reason when the input is rejected, or null if the region is unknown.
 */
export async function editRegion(id: string, input: Record<string, unknown>): Promise<RegionResult | null> {
  const parsed = regionFields.safeParse(input);
  if (!parsed.success) return { ok: false, reason: firstIssue(parsed.error) };

  return getDb().transaction(async (tx) => {
    const region = (
      await tx
        .update(referenceRegions)
        .set(parsed.data)
        .where(eq(referenceRegions.id, id))
        .returning({ referenceId: referenceRegions.referenceId })
    ).at(0);
    if (!region) return null;
    await queueEmbeddingUnlessArchived(tx, region.referenceId);
    return { ok: true, id };
  });
}

/**
 * Deletes a region for good: its crop and small version first, then its
 * row, so a failed attempt leaves the region in place for a retry. False if
 * the region is unknown.
 */
export async function removeRegion(id: string): Promise<boolean> {
  const region = await getDb().query.referenceRegions.findFirst({
    columns: { referenceId: true, cropKey: true, thumbKey: true },
    where: eq(referenceRegions.id, id),
  });
  if (!region) return false;

  const storage = getStorage();
  await Promise.all([storage.delete(region.cropKey), storage.delete(region.thumbKey)]);
  await getDb().transaction(async (tx) => {
    await tx.delete(referenceRegions).where(eq(referenceRegions.id, id));
    await queueEmbeddingUnlessArchived(tx, region.referenceId);
  });
  return true;
}

/** Queues an embedding refresh for the region's reference; an archived one has none until it leaves the archive. */
async function queueEmbeddingUnlessArchived(tx: Queries, referenceId: string) {
  const live = await tx
    .select({ id: references.id })
    .from(references)
    .where(and(eq(references.id, referenceId), ne(references.curationStatus, "archived")));
  if (live.length > 0) await queueEmbedding(tx, referenceId, "edit");
}
