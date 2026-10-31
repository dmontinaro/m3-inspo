import { contentLanguageForUi } from "#/lib/format";
import { getLocale } from "#/paraglide/runtime.js";
import { parseWeb, webValidator } from "#/lib/validation";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { Typography } from "@m3-inspo/shared/fonts";
import { z } from "zod";
import { brandKitStatuses, maxBrandKitNotesLength, maxDesignBriefingLength } from "#/lib/brand-kits";
import {
  changeBrandKitStatus,
  colorSchemeInput,
  copyBrandKit,
  createBrandKit,
  findBrandKit,
  listBrandKits,
  overwriteBrandKit,
  removeBrandKit,
  setBrandKitNotes,
  setBrandKitDesignBriefing,
  typographyInput,
} from "./brand-kits.server";
import type { ColorSchemeInput } from "./brand-kits.server";
import { draftKitBriefing } from "./kit-briefing.server";
import { keepKitTypography } from "./type-pairings.server";

/**
 * Server functions for the Brand Kit pages and the generator's "Speichern".
 * The global owner gate has already let the caller in. An invalid Color
 * Scheme is turned away here, before anything is written.
 */

/** Every kit, the last saved first, with its colours. */
export const getBrandKits = createServerFn({ method: "GET" }).handler(() => listBrandKits());

/** One kit with its Color Scheme, source references, CSS export and whether the generator now computes other values. */
export const getBrandKit = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    const kit = await findBrandKit(data.slug);
    if (!kit) throw notFound();
    return kit;
  });

/**
 * The generator's save dialog: name, project and the Color Scheme. Creates a
 * draft and answers its slug, or `{ ok: false, errors }` with German
 * messages per field.
 */
export const saveBrandKit = createServerFn({ method: "POST" })
  // Name and project get their owner-facing check in createBrandKit; this only caps the size.
  .validator(webValidator(z.object({ name: z.string().max(1000), project: z.string().max(1000), scheme: colorSchemeInput })))
  .handler(({ data: { scheme, ...fields } }) => createBrandKit(fields, scheme));

/**
 * "Speichern" on a kit's page: replaces its Color Scheme with these sources
 * and today's snapshot, and its typography (null removes it). Answers both
 * as stored.
 */
export const saveBrandKitChanges = createServerFn({ method: "POST" })
  // Typed as the page holds the typography; Zod narrows each font role to its source.
  .validator((data: { slug: string; scheme: ColorSchemeInput; typography: Typography | null }) =>
    parseWeb(z.object({ slug: z.string(), scheme: colorSchemeInput, typography: typographyInput.nullable() }), data),
  )
  .handler(async ({ data }) => {
    const stored = await overwriteBrandKit(data.slug, data.scheme, data.typography);
    if (!stored) throw notFound();
    return stored;
  });

/**
 * "Als Pairing merken": keeps the kit's saved typography as a new pairing.
 * Answers `saved` with its slug, or `duplicate` with the pairing that has
 * the same families.
 */
export const keepBrandKitTypography = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    const result = await keepKitTypography(data.slug);
    if (!result) throw notFound();
    return result;
  });

/** The kit's notes; an empty text clears them. */
export const updateBrandKitNotes = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string(), notes: z.string().max(maxBrandKitNotesLength) })))
  .handler(async ({ data }) => {
    if (!(await setBrandKitNotes(data.slug, data.notes))) throw notFound();
  });

/** The brand's design briefing in Markdown, independently of colours and typography. */
export const updateBrandKitDesignBriefing = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string(), designBriefing: z.string().max(maxDesignBriefingLength) })))
  .handler(async ({ data }) => {
    if (!(await setBrandKitDesignBriefing(data.slug, data.designBriefing))) throw notFound();
  });

/**
 * "Mit KI entwerfen": a briefing drafted from the kit and its references,
 * not saved. Answers `{ ok: false, reason }` without a key or when the model
 * did not deliver. Takes up to a minute.
 */
export const draftBrandKitDesignBriefing = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    const outputLanguage = contentLanguageForUi(getLocale());
    const result = await draftKitBriefing({ slug: data.slug, outputLanguage });
    if (!result) throw notFound();
    return result;
  });

/**
 * "Freigeben", "Archivieren", "Zurückholen" and "Zum Entwurf machen".
 * Approving resets another approved kit of the same project to draft; the
 * page asks before.
 */
export const setBrandKitStatus = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string(), status: z.enum(brandKitStatuses) })))
  .handler(async ({ data }) => {
    if (!(await changeBrandKitStatus(data.slug, data.status))) throw notFound();
  });

/** "Duplizieren": a draft copy named "… (Kopie)"; answers its slug, which the page opens. */
export const duplicateBrandKit = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    const copy = await copyBrandKit(data.slug);
    if (!copy) throw notFound();
    return copy;
  });

/** Deletes the kit for good with its links; the page asks for confirmation first. */
export const deleteBrandKit = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    if (!(await removeBrandKit(data.slug))) throw notFound();
  });
