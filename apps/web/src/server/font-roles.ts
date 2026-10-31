/**
 * The Zod check of font roles (`heading`, `body`, optional `mono`), shared
 * by type pairings (type-pairings.server.ts) and the typography of Brand
 * Kits (brand-kits.server.ts). Messages are for the owner. Per role, fields
 * that belong to another source are dropped.
 */

import { fontCategories } from "@m3-inspo/shared/fonts";
import { z } from "zod";

const roleFontFields = {
  family: z.string().trim().min(1, "Jede Schrift braucht einen Familiennamen.").max(100, "Der Familienname ist zu lang."),
  weights: z
    .array(z.number().int().min(1).max(1000))
    .min(1, "Jede Schrift braucht mindestens ein Gewicht.")
    .transform((weights) => [...new Set(weights)].sort((a, b) => a - b)),
  category: z.enum(fontCategories),
};

/**
 * "Link zur Schrift" of an adobe or local family; empty means none, a
 * missing scheme means https. The URL guard checks it afterwards.
 */
const pageUrl = z
  .string()
  .trim()
  .max(2000, "Der Link zur Schrift ist zu lang.")
  .optional()
  .transform((url) => (url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? `https://${url}` : url || undefined))
  .pipe(
    z
      .url({ protocol: /^https?$/, error: "Link zur Schrift: Bitte gib eine vollständige Adresse ein, die mit https:// oder http:// beginnt." })
      .optional(),
  );

const fontsourceFont = z.object({ ...roleFontFields, source: z.literal("fontsource"), fontsourceId: z.string().trim().min(1) });
const adobeFont = z.object({ ...roleFontFields, source: z.literal("adobe"), pageUrl });
const localFont = z.object({ ...roleFontFields, source: z.literal("local"), pageUrl });
const missingRole = (issue: { input?: unknown }) =>
  issue.input === undefined ? "Überschrift und Fließtext brauchen je eine Schrift." : undefined;

const rolesOf = <T extends z.ZodType>(roleFont: T) => z.object({ heading: roleFont, body: roleFont, mono: roleFont.optional() });

/** Font roles as the pairing form sends them. `adobeSlug` is dropped: the server looks it up. */
export const pairingFontRoles = rolesOf(z.discriminatedUnion("source", [fontsourceFont, adobeFont, localFont], { error: missingRole }));

/**
 * Font roles as a Brand Kit's typography stores them: checked like a
 * pairing's, but an Adobe family keeps the slug its pairing's save looked
 * up, since a kit copies the roles as they are.
 */
export const kitFontRoles = rolesOf(
  z.discriminatedUnion("source", [fontsourceFont, adobeFont.extend({ adobeSlug: z.string().trim().min(1).max(100).optional() }), localFont], {
    error: missingRole,
  }),
);
