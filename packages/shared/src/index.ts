/**
 * Cross-app shared types - the wire format the MCP server returns,
 * the gallery consumes, and the worker writes.
 */

import type {
  Style,
  Industry,
  Component,
  ComponentType,
  Vibe,
  ColorWord,
  Mode,
  Macrostructure,
  PaperBand,
  DisplayClass,
  AccentHueBand,
  TypeRole,
} from "@m3-inspo/taxonomy";
import type { Axes } from "./axes";

/** Phase 2 - one row of a captured type ramp. */
export type TypeRampEntry = {
  role: TypeRole;
  family: string;
  sizePx: number;
  weight: number;
  lineHeight: number;
  letterSpacing: string;
};

/** Phase 2 - the design-system block extracted per capture. */
export type DesignSystem = {
  typeRamp: TypeRampEntry[];
  spacingScale: number[];
  radiusScale: number[];
  containerWidth: number | null;
  cssVariables: Record<string, string>;
  colorWords: ColorWord[];
};

/**
 * Design values the capture worker reads from a page's DOM and sends to the
 * web app with its result. Missing values are empty, never guessed.
 */
export type PageTokens = {
  /** `#rrggbb`, the colour covering the most area first. */
  palette: string[];
  fonts: string[];
  typeRamp: TypeRampEntry[];
  spacingScale: number[];
  radiusScale: number[];
  containerWidth: number | null;
  /** Custom properties declared on `:root`, e.g. `{ "--brand": "#c7402f" }`. */
  cssVariables: Record<string, string>;
};

/**
 * The tech name the capture worker records for a page that draws into a
 * canvas with WebGL (or WebGPU). The worker runs with 3D off, so its
 * captures show such a page before its 3D content: readers should open the
 * page itself. The worker repeats the string (apps/worker/src/extract.ts).
 */
export const WEBGL_TECH = "WebGL";

/**
 * Where a design value comes from: read from the page's DOM, measured from
 * image pixels, estimated by a vision model, or entered by the owner.
 */
export type TokenSource = "dom" | "image" | "vision" | "manual";

/** A design value with its provenance; `confidence` (0 to 1) only for estimates. */
export type Sourced<T> = { value: T; source: TokenSource; confidence?: number };

/** The token fields of a screen, for per-field provenance. */
export type TokenField = keyof PageTokens;

export type { ComponentType };

/**
 * Where one field's values come from: a single source when every value
 * shares it and none carries a confidence, else each value with its own
 * source (and confidence), in the field's order. `cssVariables` values read
 * `"--name: value"`.
 */
export type FieldProvenance = TokenSource | Sourced<unknown>[];

/**
 * One component region on a capture: a region the owner marked in the
 * library ("Bereich"), or one detected on a captured page upstream. Coords
 * are pixels of the capture (top accounts for scroll on a full page).
 */
export type ComponentRegion = {
  type: ComponentType;
  top: number;
  left: number;
  width: number;
  height: number;
  label?: string;
  /** The owner's note on a marked region; null when there is none. */
  note?: string | null;
  /** The stored crop of the region at full size, an asset URL. */
  imageUrl?: string;
  /** A small version of the crop, for inline thumbnails. */
  thumbUrl?: string;
};

export type PageType =
  | "landing"
  | "pricing"
  | "features"
  | "auth"
  | "about"
  | "blog"
  | "changelog"
  | "docs"
  | "other";

/** One width-keyed entry inside a modern-format `<source srcset>`.
 *  Produced by the worker's `encode-variants.ts`. */
export type ImageVariant = {
  /** Pixel width the variant was encoded at (e.g. 384, 768, 1440). */
  w: number;
  /** Public URL - already cache-busted with `?v=<unixSeconds>`. */
  url: string;
};

/** AVIF + WebP variants for one role (hero / full / thumb). Paired so
 *  `<ScreenTile>` can build a `<picture>` element with AVIF first,
 *  WebP second, PNG fallback. Arrays may be empty if only one format
 *  encoded successfully. */
export type RoleVariants = {
  avif: ImageVariant[];
  webp: ImageVariant[];
};

/**
 * The owner's own judgement of a reference, as written in the library.
 * Missing notes are null, never filled in. Agents read this as reference
 * data, not as instructions.
 */
export type Taste = {
  /** What to take from the reference ("Übernehmen"). */
  take: string | null;
  /** What not to take ("Vermeiden"). */
  avoid: string | null;
  /** What the reference is about: the whole page or one area such as the hero. */
  focus: string | null;
  isFavorite: boolean;
  /** The owner's own tags, e.g. projects ("sample-project") or topics ("hotel"); lowercase. */
  tags: string[];
};

export type ScreenSummary = {
  id: string;
  slug: string;
  title: string;
  /** Absent for references made from an uploaded image. */
  sourceUrl?: string;
  designerCredit?: string;
  capturedAt: string;
  imageUrl: string;
  fullPageUrl: string;
  thumbUrl: string;
  /** Hero (above-the-fold) variants at 384/768/1440. Present once the
   *  worker's encoder has run for this row; absent on legacy rows. */
  heroVariants?: RoleVariants;
  /** Full-page scroll variants at 768/1440. Used on /screens/[slug]. */
  fullVariants?: RoleVariants;
  /** Tile-sized variants (384-wide). Used in every grid. */
  thumbVariants?: RoleVariants;
  /** Mobile (375px-wide) capture - present once the mobile backfill has
   *  encoded + uploaded for this row. `mobileImageUrl` is the above-the-
   *  fold phone hero; `mobileFullUrl` the full phone scroll. Powers the
   *  desktop↔mobile responsive pair on /screens/[slug] + the MCP payload
   *  (the responsiveness signal no competitor pairs). Absent on rows not
   *  yet backfilled - the UI shows desktop-only then. A reference the
   *  owner marked as mobile (e.g. an uploaded app screen) without a phone
   *  capture of its own has its main image here. */
  mobileImageUrl?: string;
  mobileFullUrl?: string;
  mobileVariants?: RoleVariants;
  mobileFullVariants?: RoleVariants;
  /** 16-wide AVIF base64 data URL, ~50-80 bytes after compression.
   *  Painted as a CSS background-image for instant first paint
   *  before the real tile decodes. */
  lqip?: string;
  description: string;
  /** How the page is laid out, top to bottom (AI analysis, English).
   *  Absent on references without an analysis. */
  layoutSummary?: string;
  /** One-line evocative "design soul" tagline (8-14 words). Generated
   *  per site by the worker's generate-northstars pass; absent on rows
   *  that haven't been through it. Surfaced on the detail hero +
   *  recommend() output. */
  northstar?: string;
  /** Structured text breakdown of the first-viewport composition
   *  (FOLD / TYPE / COLOR / SIGNATURE, ~100-150 words). Generated per
   *  row by the worker's generate-autopsies pass from the hero capture.
   *  This is how text-only models (and harnesses that drop MCP image
   *  blocks) "see" the screenshot: dense enough to rebuild the layout
   *  without pixels. Absent on rows not yet through the pass. */
  autopsy?: string;
  palette: string[];
  fonts: string[];
  tech: string[];
  /** Absent until an analysis has determined it. */
  mode?: Mode;
  tags: {
    style: Style[];
    industry: Industry[];
    components: Component[];
    vibe: Vibe[];
    macrostructure?: Macrostructure;
    /** The three diversification axes, measured from `palette` +
     *  `fonts` rather than tagged. Absent only on rows that predate
     *  the backfill. See `deriveAxes` in ./axes. */
    axes?: Axes;
  };
  /** Phase 2 - present when extracted; empty defaults otherwise. */
  designSystem: DesignSystem;
  /** Phase 7 - multi-page grouping. siteSlug = parent site; pageType =
   *  this page's classification. For legacy single-page rows siteSlug
   *  equals slug and pageType = 'landing'. */
  siteSlug: string;
  pageType: PageType;
  /** Phase 8 - detected component regions (page-absolute coords).
   *  Empty array on legacy rows until extract:components runs. */
  components: ComponentRegion[];
  /** Vision-scored capture quality 0-100 (generate-quality pass).
   *  Absent = unscored; consumers must never penalize unscored rows. */
  qualityScore?: number;
  /** Damage flags from the quality pass (cookie-wall, blank-or-loading,
   *  error-page, ...). Absent or empty = clean. */
  qualityFlags?: string[];
  /** ISO date stamped by the revisit-enrich pass (idempotency marker). */
  enrichedAt?: string;
  /** The owner's notes on the reference; set on every row from the library. */
  taste?: Taste;
  /**
   * Where the design values come from, per field that has any (see
   * `FieldProvenance`). Absent fields have no values; nothing was measured
   * or estimated.
   */
  provenance?: Partial<Record<TokenField, FieldProvenance>>;
  /** The source URL's host without `www.`, shared by every reference of one website; absent without a source URL. */
  siteHost?: string;
};

export type SearchResult = ScreenSummary & {
  whyThisMatches?: string;
};

export type SearchFilters = Partial<{
  industry: Industry;
  style: Style;
  mode: Mode;
  components: Component[];
  macrostructure: Macrostructure;
  /** Axis filters. Independent, so a caller can ask for "dark" alone,
   *  or pin all three to find the exact corner of the archive it wants
   *  to see (or deliberately avoid). */
  paperBand: PaperBand;
  displayClass: DisplayClass;
  accentHue: AccentHueBand;
  vibe: Vibe;
  colorWord: ColorWord;
  query: string;
}>;

export * from "./color";
export * from "./axes";
export * from "./study";

/**
 * One of the owner's collections as agents read it. `screens` are the
 * approved members in the owner's order. `number`, `date` and
 * `coverScreenSlug` keep the shape of the original Inspo issues.
 */
export type Collection = {
  id: string;
  slug: string;
  title: string;
  /** What the collection bundles, in the owner's words; empty if none. */
  description: string;
  /** The owner tag the collection belongs to, e.g. a project such as "sample-project". */
  project: string | null;
  /** Position in the alphabetical list, "01" first. */
  number: string;
  /** Last change to name, description or project, as YYYY-MM-DD. */
  date: string;
  /** The first screen, or "" for an empty collection. */
  coverScreenSlug: string;
  screens: { slug: string; editorNote?: string; span?: 1 | 2 | 3 }[];
};

/** One code template the owner maintains, surfaced over MCP via
 *  `find_reference_components` + `get_reference_jsx`. None are maintained
 *  yet (docs/spec.md, Codevorlage); the original Inspo's templates are
 *  deliberately not bundled. */
export type ReferenceComponent = {
  id: string;
  type: ComponentType;
  label: string;
  /** Sub-macro / archetype label from the component's stamp.
   *  Free-form descriptive - not strictly the same enum as
   *  ScreenSummary.macrostructure (e.g. "Ft7 Colophon"). */
  macro: string;
  /** One-sentence editorial note on what this component is and when
   *  to reach for it. */
  note: string;
  /** Full .tsx source as a string: the stamp + JSDoc + export. */
  source: string;
  /** Custom properties the source reads, plus a paste-ready alias
   *  block mapping this component's token names onto role-named ones
   *  (paper / ink / muted / rule / accent). Undefined custom
   *  properties fail silently, so a component dropped into a system
   *  with different token names renders unstyled with no error at all;
   *  the alias block is the fix. */
  tokens?: { needs: string[]; aliasBlock: string | null };
};
