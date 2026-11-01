import { webValidator } from "#/lib/validation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_EXTRAS } from "@m3-inspo/shared/color-scheme";
import { loadGeneratorPool, readImagePixel as readPixel } from "./generator.server";

/** Server functions for the generator page. The global owner gate has already let the caller in. */

const pool = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("project"), tag: z.string().max(200) }),
  z.object({ kind: z.literal("collection"), slug: z.string().max(200) }),
  z.object({ kind: z.literal("references"), slugs: z.array(z.string().max(200)).max(100) }),
]);

/**
 * The pool to roll from, the references the URL's colours name (`linked`,
 * slugs) and the pool menu's projects and collections.
 */
export const getGeneratorPool = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ pool, linked: z.array(z.string().max(200)).max(MAX_EXTRAS + 2) })))
  .handler(({ data }) => loadGeneratorPool(data.pool, data.linked));

/**
 * The pipette's take: the exact colour (hex) of pixel `x`, `y` of a stored
 * image, given by its asset URL (the pipette passes a pool reference's
 * `imageUrl`, but any stored asset works), or null where there is none.
 */
export const readImagePixel = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ image: z.string().max(500), x: z.int().min(0).max(100_000), y: z.int().min(0).max(100_000) })))
  .handler(({ data }) => readPixel(data.image, data.x, data.y));
