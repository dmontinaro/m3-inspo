/** URL slugs for references, collections, Brand Kits and type pairings. Pure helpers, no database. */

import { randomUUID } from "node:crypto";

/** "Zimmerübersicht Boutique-Hotel" → "zimmeruebersicht-boutique-hotel", at most 60 characters; empty without letters or digits. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The slug with a short random suffix, for when the plain one is taken. */
export const withRandomSuffix = (slug: string) => `${slug}-${randomUUID().slice(0, 6)}`;
