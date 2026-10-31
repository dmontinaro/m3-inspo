/**
 * The library side of the generator: the pool it rolls from (spec #44,
 * "Pool"), the references its URL names and what the pool menu offers.
 * One catalogue load per call; the catalogue holds approved references only.
 */

import sharp from "sharp";
import { selectPool } from "@m3-inspo/db";
import { assetsPath, loadCatalogue } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import type { ScreenSummary } from "@m3-inspo/shared";
import type { Pool } from "@m3-inspo/shared/color-scheme";
import type { GeneratorReference, PoolData, PoolReference } from "#/lib/generator";
import { maxPixels } from "#/lib/upload-limits";
import { getStorage, isValidKey } from "./storage.server";

const brief = ({ id, slug, title, thumbUrl }: ScreenSummary): GeneratorReference => ({ id, slug, title, thumbUrl });

/** A pool reference; its image is the full page's original (full size, as stored) for the pipette. */
const poolReference = (screen: ScreenSummary): PoolReference => ({ ...brief(screen), imageUrl: screen.fullPageUrl });

/**
 * The pool's references and colours, the references named by `linked`
 * slugs (a colour's `@slug` in the URL, in the pool or not) with their
 * measured colours, every collection and every project: the owner tags of
 * approved references, the most used first.
 */
export async function loadGeneratorPool(pool: Pool, linked: string[]): Promise<PoolData> {
  const catalogue = await loadCatalogue(getDb());
  const selected = selectPool(catalogue, pool);
  const named = selectPool(catalogue, { kind: "references", slugs: linked });

  const tagCounts = new Map<string, number>();
  for (const tag of catalogue.screens.flatMap((screen) => screen.taste?.tags ?? [])) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  return {
    references: selected.references.map(poolReference),
    colors: selected.colors,
    linked: { references: named.references.map(brief), colors: named.colors },
    collections: catalogue.collections.map(({ slug, title }) => ({ slug, name: title })),
    projects: [...tagCounts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)).map(([tag]) => tag),
  };
}

/**
 * The pipette's take: the exact colour of one pixel of a stored image, as
 * hex, read from the file itself, so neither the browser's downsampling nor
 * its colour management can change it. `image` is an asset URL as the pool
 * gives it (`imageUrl`), though any stored asset works. A pixel outside the
 * image, a file the storage does not have, one that is no image or one too
 * large to decode is null. Transparent pixels read as on white, the way the
 * pipette shows them.
 */
export async function readImagePixel(image: string, x: number, y: number): Promise<string | null> {
  const key = image.startsWith(assetsPath) ? image.slice(assetsPath.length) : "";
  const object = isValidKey(key) ? await getStorage().read(key) : null;
  if (!object) return null;
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  try {
    const decoded = sharp(bytes, { limitInputPixels: maxPixels, sequentialRead: true });
    const { width, height } = await decoded.metadata();
    if (x >= width || y >= height) return null;
    const pixel = await decoded
      .flatten({ background: "#ffffff" })
      .extract({ left: x, top: y, width: 1, height: 1 })
      .toColourspace("srgb")
      .raw()
      .toBuffer();
    return `#${pixel.subarray(0, 3).toString("hex")}`;
  } catch {
    // sharp throws on data it cannot decode and on images past the pixel limit.
    return null;
  }
}
