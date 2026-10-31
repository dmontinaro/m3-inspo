/**
 * Type pairings: font combinations the owner keeps, one family with its
 * weights per font role (spec #62). Part of the library; server functions
 * (type-pairings.functions.ts) call only this module. Every write checks
 * the font roles with Zod, looks up Adobe families at Adobe Fonts and
 * refuses a combination that is already kept. Saved Adobe families go into
 * the preview kit (adobe-fonts.server.ts); new page URLs get a font preview
 * (font-previews.server.ts). Brand Kits copy a pairing's roles into their
 * typography, so editing or deleting a pairing never changes a kit.
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { brandKits, typePairings } from "@m3-inspo/db/library-schema";
import { fontRoles, pairingNameOf, sameFamilies } from "@m3-inspo/shared/fonts";
import type { FontRoles } from "@m3-inspo/shared/fonts";
import { z } from "zod";
import { maxPairingNameLength, maxPairingNoteLength } from "#/lib/fonts";
import { addToPreviewKit, adobeFontsEnabled, findAdobeFamily } from "./adobe-fonts.server";
import { findFontPreviews, pageUrlsOf, queueFontPreviews } from "./font-previews.server";
import { pairingFontRoles } from "./font-roles";
import { blockedReason } from "./import-jobs.server";
import { slugify, withRandomSuffix } from "./slug";

/**
 * The pairing form's fields. An empty name becomes the families' names
 * (pairingNameOf), an empty note null; messages are for the owner.
 */
const pairingFields = z
  .object({
    name: z.string().trim().max(maxPairingNameLength, `Der Name ist zu lang (höchstens ${maxPairingNameLength} Zeichen).`),
    note: z
      .string()
      .trim()
      .max(maxPairingNoteLength, `Die Notiz ist zu lang (höchstens ${maxPairingNoteLength} Zeichen).`)
      .transform((note) => note || null),
    roles: pairingFontRoles,
  })
  .transform((fields) => ({ ...fields, name: fields.name || pairingNameOf(fields.roles).slice(0, maxPairingNameLength).trim() }));

/** What the pairing form sends; roles the owner has not chosen yet are missing. */
export type PairingInput = { name: string; note: string; roles: Partial<FontRoles> };

/** Per field of the pairing form, why it was rejected. */
export type PairingErrors = Partial<Record<keyof PairingInput, string[]>>;

/**
 * The outcome of saving the pairing form: saved, rejected with messages per
 * field, or refused because `pairing` already has the same families in the
 * same roles.
 */
export type SavePairingResult =
  | { status: "saved"; slug: string }
  | { status: "invalid"; errors: PairingErrors }
  | { status: "duplicate"; pairing: { slug: string; name: string } };

/**
 * Looks up the Adobe families of `roles` at Adobe Fonts and gives each the
 * name as Adobe spells it and its slug. Returns the roles, the families'
 * Adobe ids for the preview kit and the names Adobe does not know. Without
 * ADOBE_FONTS_API_TOKEN, or while Adobe does not answer, families stay as typed.
 */
async function checkAdobeFamilies(roles: FontRoles) {
  const checked = { ...roles };
  const ids: string[] = [];
  const unknown: string[] = [];
  if (!adobeFontsEnabled()) return { roles: checked, ids, unknown };

  for (const role of fontRoles) {
    const font = roles[role];
    if (font?.source !== "adobe") continue;
    const family = await findAdobeFamily(font.family).catch((error: unknown) => {
      console.warn("[adobe-fonts] lookup failed, the family stays as typed:", error);
      return undefined;
    });
    if (family === null) unknown.push(font.family);
    if (!family) continue;
    checked[role] = { ...font, family: family.name, adobeSlug: family.slug };
    ids.push(family.id);
  }
  return { roles: checked, ids, unknown };
}

/**
 * Checks the form, the page URLs with the URL guard and the Adobe families,
 * and looks for a kept pairing (archived ones too) with the same families;
 * `exceptId` is the pairing being edited. `adobeIds` are for the preview kit
 * once the pairing is saved.
 */
async function checkPairing(
  input: unknown,
  exceptId?: string,
): Promise<
  | Exclude<SavePairingResult, { status: "saved" }>
  | { status: "valid"; fields: Omit<z.output<typeof pairingFields>, "roles"> & { roles: FontRoles }; adobeIds: string[] }
> {
  const parsed = pairingFields.safeParse(input);
  if (!parsed.success) return { status: "invalid", errors: z.flattenError(parsed.error).fieldErrors };
  for (const url of pageUrlsOf(parsed.data.roles)) {
    const blocked = await blockedReason(url);
    if (blocked) return { status: "invalid", errors: { roles: [`Link zur Schrift: ${blocked}`] } };
  }

  const adobe = await checkAdobeFamilies(parsed.data.roles);
  if (adobe.unknown.length > 0) {
    const errors = adobe.unknown.map((family) => `Adobe Fonts kennt „${family}“ nicht. Schreib den Namen wie auf fonts.adobe.com.`);
    return { status: "invalid", errors: { roles: errors } };
  }
  const fields = { ...parsed.data, roles: adobe.roles };

  const kept = await getDb().query.typePairings.findMany({ columns: { id: true, slug: true, name: true, roles: true } });
  const duplicate = kept.find((pairing) => pairing.id !== exceptId && sameFamilies(pairing.roles, fields.roles));
  if (duplicate) return { status: "duplicate", pairing: { slug: duplicate.slug, name: duplicate.name } };
  return { status: "valid", fields, adobeIds: adobe.ids };
}

/** Adds saved Adobe families to the preview kit in the background; saving does not wait for Adobe. */
function addToPreviewKitLater(adobeIds: string[]) {
  if (adobeIds.length === 0) return;
  addToPreviewKit(adobeIds).catch((error: unknown) => console.warn("[adobe-fonts] preview kit not updated:", error));
}

/**
 * Brings the Adobe families of all pairings into the preview kit, also
 * those saved before ADOBE_FONTS_API_TOKEN was set. Run at server start
 * (job-runner.plugin.ts); returns the Adobe ids it added.
 */
export async function syncAdobePreviewKit() {
  const pairings = await getDb().query.typePairings.findMany({ columns: { roles: true } });
  const names = new Set(
    pairings.flatMap(({ roles }) => fontRoles.flatMap((role) => (roles[role]?.source === "adobe" ? [roles[role].family] : []))),
  );
  const ids: string[] = [];
  for (const name of names) {
    const family = await findAdobeFamily(name);
    if (family) ids.push(family.id);
  }
  return addToPreviewKit(ids);
}

/** "neu" is the new-pairing page, so no pairing may have it as its slug. */
const reservedSlugs = new Set(["neu"]);

/**
 * Creates a pairing by hand from the form (`name`, `note`, `roles`). The
 * slug comes from the name and stays when the name changes. With
 * `originBrandKitId` it is that kit's typography kept as a pairing ("Als
 * Pairing merken").
 */
export async function createTypePairing(input: unknown, originBrandKitId?: string): Promise<SavePairingResult> {
  const checked = await checkPairing(input);
  if (checked.status !== "valid") return checked;

  const base = slugify(checked.fields.name) || "pairing";
  const taken =
    reservedSlugs.has(base) ||
    (await getDb().query.typePairings.findFirst({ columns: { id: true }, where: eq(typePairings.slug, base) }));
  const slug = taken ? withRandomSuffix(base) : base;
  const origin = originBrandKitId ? { originKind: "brand_kit" as const, originBrandKitId } : { originKind: "manual" as const };
  await getDb()
    .insert(typePairings)
    .values({ slug, ...checked.fields, ...origin });
  addToPreviewKitLater(checked.adobeIds);
  await queueFontPreviews(pageUrlsOf(checked.fields.roles));
  return { status: "saved", slug };
}

/** Saves the form for `slug`, replacing name, note and roles; null if the slug is unknown. */
export async function editTypePairing(slug: string, input: unknown): Promise<SavePairingResult | null> {
  const pairing = await getDb().query.typePairings.findFirst({ columns: { id: true }, where: eq(typePairings.slug, slug) });
  if (!pairing) return null;

  const checked = await checkPairing(input, pairing.id);
  if (checked.status !== "valid") return checked;
  await getDb().update(typePairings).set(checked.fields).where(eq(typePairings.id, pairing.id));
  addToPreviewKitLater(checked.adobeIds);
  await queueFontPreviews(pageUrlsOf(checked.fields.roles));
  return { status: "saved", slug };
}

/**
 * "Als Pairing merken" on a kit's page: keeps the kit's saved typography as
 * a new pairing named like the kit, with the kit as its origin, and makes
 * that pairing the typography's origin. Answers like the pairing form (a
 * combination already kept comes back as `duplicate`); null if the slug is
 * unknown or the kit has no typography.
 */
export async function keepKitTypography(kitSlug: string): Promise<SavePairingResult | null> {
  const kit = await getDb().query.brandKits.findFirst({ columns: { id: true, name: true, typography: true }, where: eq(brandKits.slug, kitSlug) });
  if (!kit?.typography) return null;

  const name = kit.name.slice(0, maxPairingNameLength).trim();
  const result = await createTypePairing({ name, note: "", roles: kit.typography.roles }, kit.id);
  if (result.status !== "saved") return result;
  const pairing = await getDb().query.typePairings.findFirst({ columns: { id: true }, where: eq(typePairings.slug, result.slug) });
  const origin = { originPairingId: pairing?.id ?? null, originPairingDeleted: false };
  // Only the origin changes; the roles stay as saved, also when a save came in meanwhile.
  await getDb()
    .update(brandKits)
    .set({ typography: sql`${brandKits.typography} || ${JSON.stringify(origin)}::jsonb` })
    .where(eq(brandKits.id, kit.id));
  return result;
}

/**
 * Deletes the pairing for good. Kits whose typography came from it keep
 * their roles; their origin turns null and reads "aus einem gelöschten
 * Pairing". Their `updated_at` stays: the kit's values did not change.
 * False if the slug is unknown.
 */
export async function removeTypePairing(slug: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const pairing = (await tx.delete(typePairings).where(eq(typePairings.slug, slug)).returning({ id: typePairings.id })).at(0);
    if (!pairing) return false;
    await tx
      .update(brandKits)
      .set({
        typography: sql`${brandKits.typography} || '{"originPairingId": null, "originPairingDeleted": true}'::jsonb`,
        updatedAt: sql`${brandKits.updatedAt}`,
      })
      .where(sql`${brandKits.typography}->>'originPairingId' = ${pairing.id}`);
    return true;
  });
}

/** Pairings that are not archived, newest first. */
export async function listTypePairings() {
  return getDb().query.typePairings.findMany({
    columns: { id: true, slug: true, name: true, roles: true },
    where: eq(typePairings.archived, false),
    orderBy: [desc(typePairings.createdAt)],
  });
}

/**
 * One pairing with its origin and the font previews of its page URLs (by
 * URL), or null if the slug is unknown. `origin.reference` and
 * `origin.brandKit` are null for a reference or kit deleted since.
 */
export async function findTypePairing(slug: string) {
  const pairing = await getDb().query.typePairings.findFirst({
    columns: { id: true, slug: true, name: true, note: true, roles: true, originKind: true, archived: true, createdAt: true },
    where: eq(typePairings.slug, slug),
    with: { originReference: { columns: { slug: true, title: true } }, originBrandKit: { columns: { slug: true, name: true } } },
  });
  if (!pairing) return null;

  const { originKind, originReference, originBrandKit, ...fields } = pairing;
  const previews = await findFontPreviews(pageUrlsOf(pairing.roles));
  return { ...fields, origin: { kind: originKind, reference: originReference, brandKit: originBrandKit }, previews };
}
