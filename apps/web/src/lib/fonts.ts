import * as m from "#/paraglide/messages.js";
/**
 * Font vocabulary of the type pairing pages: the shared categories, sources
 * and roles (@m3-inspo/shared/fonts) with the labels the owner sees, the sample
 * texts of the previews and where the previews load Fontsource files and
 * Adobe families from.
 */

import type { FontCategory, FontRole, FontSource, RoleFont } from "@m3-inspo/shared/fonts";

export { fontCategories, fontRoles, fontSources, pairingNameOf } from "@m3-inspo/shared/fonts";
export type { FontCategory, FontRole, FontRoles, FontSource, RoleFont } from "@m3-inspo/shared/fonts";

export const fontCategoryLabels: Record<FontCategory, string> = {
  get serif() { return m.font_category_serif(); },
  get sans() { return m.font_category_sans(); },
  get mono() { return m.font_category_mono(); },
  get display() { return m.font_category_display(); },
  get handwriting() { return m.font_category_handwriting(); },
};

export const fontSourceLabels: Record<FontSource, string> = {
  get fontsource() { return m.font_source_fontsource(); },
  get adobe() { return m.font_source_adobe(); },
  get local() { return m.font_source_local(); },
};

export const fontRoleLabels: Record<FontRole, string> = { get heading() { return m.font_role_heading(); }, get body() { return m.font_role_body(); }, get mono() { return m.font_category_mono(); } };

/** The weight closest to regular, for running text and glyphs. */
export const regularWeight = (font: RoleFont) =>
  font.weights.reduce((best, weight) => (Math.abs(weight - 400) < Math.abs(best - 400) ? weight : best));

/** The weights offered for adobe and local families, where no catalog says which exist. */
export const standardWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const maxPairingNameLength = 100;
export const maxPairingNoteLength = 2000;

export const sampleTexts = {
  get heading() { return m.font_sample_heading(); },
  get body() { return m.font_sample_body(); },
  mono: "shift.start = 06:30 · team: front-office",
  glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz ÄÖÜäöüß 0123456789 &?!€",
};

/**
 * One weight of a Fontsource family on jsDelivr (latin subset, which has
 * umlauts, ß and €). Never Google's CDN.
 * `@latest`: the catalog mirrors no package version yet.
 */
export const fontsourceFileUrl = (fontsourceId: string, weight: number) =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${fontsourceId}@latest/latin-${weight}-normal.woff2`;

/** The Adobe preview kit's stylesheet; it declares every family of the kit under its slug. */
export const adobeKitStylesheetUrl = (kitId: string) => `https://use.typekit.net/${kitId}.css`;

/**
 * An Adobe family's CSS name in the preview kit: its slug, or for families
 * saved without a lookup the slug Adobe most likely gives it.
 */
export const adobeCssName = (font: RoleFont) =>
  font.adobeSlug ??
  font.family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Compare only submitted font data, using the same whitespace, URL and weight normalization as validation. */
export function fontRolesKey(roles: Partial<Record<FontRole, RoleFont>>) {
  return JSON.stringify((["heading", "body", "mono"] as const).map((role) => {
    const font = roles[role];
    if (!font) return null;
    const address = font.pageUrl?.trim();
    const pageUrl = address && !/^[a-z][a-z0-9+.-]*:/i.test(address) ? `https://${address}` : address;
    return [font.source, font.family.trim(), font.category, [...new Set(font.weights)].sort((a, b) => a - b), font.source === "fontsource" ? font.fontsourceId?.trim() : pageUrl || null];
  }));
}
