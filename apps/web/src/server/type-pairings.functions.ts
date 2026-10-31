import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recaptureFontPreview } from "./font-previews.server";
import { createTypePairing, editTypePairing, findTypePairing, listTypePairings, removeTypePairing } from "./type-pairings.server";
import type { PairingInput } from "./type-pairings.server";

/**
 * Server functions for the type pairing pages ("Schriften"). The global
 * owner gate has already let the caller in. The save functions pass the
 * form on unchecked: type-pairings.server.ts checks it with Zod and answers
 * German messages per field.
 */

/** Pairings that are not archived, newest first. */
export const getTypePairings = createServerFn({ method: "GET" }).handler(() => listTypePairings());

/** One pairing with its origin. */
export const getTypePairing = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const pairing = await findTypePairing(data.slug);
    if (!pairing) throw notFound();
    return pairing;
  });

/** The new-pairing form. Answers `saved`, `invalid` with errors per field, or `duplicate` with the kept pairing. */
export const addTypePairing = createServerFn({ method: "POST" })
  .validator((data: PairingInput) => data)
  .handler(({ data }) => createTypePairing(data));

/** The edit form: `slug` plus the fields of the new-pairing form. */
export const updateTypePairing = createServerFn({ method: "POST" })
  .validator((data: PairingInput & { slug: string }) => data)
  .handler(async ({ data: { slug, ...fields } }) => {
    const result = await editTypePairing(String(slug), fields);
    if (!result) throw notFound();
    return result;
  });

/**
 * Deletes a pairing for good; kits that took it over keep their fonts. No
 * page offers it yet: the list's "Löschen" follows with #65.
 */
export const deleteTypePairing = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    if (!(await removeTypePairing(data.slug))) throw notFound();
  });

/** "Neu aufnehmen": captures a font's page again, unless a capture is already waiting or running. */
export const recaptureFontPage = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.url({ protocol: /^https?$/ }) }))
  .handler(({ data }) => recaptureFontPreview(data.url));
