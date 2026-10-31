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
  serif: "Serif",
  sans: "Sans",
  mono: "Mono",
  display: "Display",
  handwriting: "Handschrift",
};

export const fontSourceLabels: Record<FontSource, string> = {
  fontsource: "Fontsource",
  adobe: "Adobe Fonts",
  local: "Lokal",
};

export const fontRoleLabels: Record<FontRole, string> = { heading: "Überschrift", body: "Fließtext", mono: "Mono" };

/** The weight closest to regular, for running text and glyphs. */
export const regularWeight = (font: RoleFont) =>
  font.weights.reduce((best, weight) => (Math.abs(weight - 400) < Math.abs(best - 400) ? weight : best));

/** The weights offered for adobe and local families, where no catalog says which exist. */
export const standardWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const maxPairingNameLength = 100;
export const maxPairingNoteLength = 2000;

export const sampleTexts = {
  heading: "Dienstplan steht. Alle wissen Bescheid.",
  body: "Ein guter Aufenthalt beginnt mit klaren Informationen. Zimmer, Angebote und Buchung bleiben auf jedem Bildschirm gut lesbar.",
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
