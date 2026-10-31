/**
 * Font vocabulary of type pairings and the pure parts the web app and the
 * MCP server share (spec #62, "Typo-Kern"): categories, sources, the stored
 * shape of the font roles, the fixed fallback stacks and the duplicate check.
 * Words as in CONTEXT.md, section Schriften.
 */

/** What a typeface is for; the font catalog maps Fontsource's categories onto these. */
export const fontCategories = ["serif", "sans", "mono", "display", "handwriting"] as const;
export type FontCategory = (typeof fontCategories)[number];

/** Where a family comes from: the Fontsource catalog, Adobe Fonts or the owner's machine. */
export const fontSources = ["fontsource", "adobe", "local"] as const;
export type FontSource = (typeof fontSources)[number];

/** The font roles ("Schriftrollen") of a pairing, in display order; `mono` is optional. */
export const fontRoles = ["heading", "body", "mono"] as const;
export type FontRole = (typeof fontRoles)[number];

/** One font role's family with the weights the pairing uses. */
export type RoleFont = {
  /** As a designer says it, e.g. "Inter". */
  family: string;
  /** Ascending, without duplicates, at least one. */
  weights: number[];
  /** From the catalog for Fontsource families; chosen by hand for adobe/local (default "sans"). */
  category: FontCategory;
  source: FontSource;
  /** Fontsource only. */
  fontsourceId?: string;
  /**
   * Adobe only: the family's slug at Adobe Fonts, also its CSS name in the
   * preview kit. Set by the server when it found the family; missing without
   * ADOBE_FONTS_API_TOKEN.
   */
  adobeSlug?: string;
  /**
   * Adobe and local only: the family's page, e.g. at its foundry. The app
   * captures it as the font preview, for families it cannot load itself.
   */
  pageUrl?: string;
};

export type FontRoles = { heading: RoleFont; body: RoleFont; mono?: RoleFont };

/**
 * A Brand Kit's typography: its font roles, a copy taken from a type
 * pairing or set directly, and the pairing they came from. Deleting that
 * pairing turns `originPairingId` null and `originPairingDeleted` true;
 * the roles stay. `scale` is the Typo-Skala's place (#69), null until then.
 */
export type Typography = {
  roles: FontRoles;
  originPairingId: string | null;
  originPairingDeleted: boolean;
  scale: null;
};

/**
 * A fixed system stack per category (modern-font-stacks, CC0). It stands in
 * for a family that cannot be loaded (local, adobe without preview kit) and
 * follows every loaded family in CSS.
 */
export const fallbackStacks: Record<FontCategory, string> = {
  sans: "system-ui, sans-serif",
  serif: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  display: "system-ui, sans-serif",
  handwriting: "'Segoe Print', 'Bradley Hand', Chilanka, TSCu_Comic, casual, cursive",
};

const familyKey = (font: RoleFont | undefined) => font?.family.trim().toLowerCase() ?? "";

/**
 * Whether two sets of font roles are the same combination: the same family
 * (ignoring case) in every role, a missing `mono` only matching a missing
 * one. Weights, categories and sources do not count.
 */
export const sameFamilies = (a: FontRoles, b: FontRoles) =>
  fontRoles.every((role) => familyKey(a[role]) === familyKey(b[role]));

/**
 * The name a pairing gets when the owner gives none: its families in role
 * order, each once, e.g. "Fraunces + Inter + JetBrains Mono". Empty while
 * no role has a family.
 */
export const pairingNameOf = (roles: Partial<FontRoles>) =>
  [...new Set(fontRoles.flatMap((role) => roles[role]?.family.trim() || []))].join(" + ");
