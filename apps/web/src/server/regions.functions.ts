import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { editRegion, markRegion, removeRegion } from "./regions.server";

/**
 * Server functions for marking regions in the detail view. The global owner
 * gate has already let the caller in. Adding and editing answer
 * `{ ok: false, reason }` with a German reason when the input is rejected.
 */

const regionFields = { componentType: z.string(), note: z.string() };

/** Marks a region: the capture's id, the rectangle in the capture's pixels, type and note. */
export const addRegion = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string(),
      captureId: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      ...regionFields,
    }),
  )
  .handler(async ({ data: { slug, ...region } }) => {
    const result = await markRegion(slug, region);
    if (!result) throw notFound();
    return result;
  });

/** Changes a region's type and note. */
export const updateRegion = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid(), ...regionFields }))
  .handler(async ({ data: { id, ...fields } }) => {
    const result = await editRegion(id, fields);
    if (!result) throw notFound();
    return result;
  });

/** Deletes a region with its crop; the UI asks for confirmation first. */
export const deleteRegion = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    if (!(await removeRegion(data.id))) throw notFound();
  });
