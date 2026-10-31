/**
 * Catalogue queries.
 *
 * Every function reads the `Catalogue` it is handed and nothing else: no
 * module state, no environment, no database. The caller decides where
 * the catalogue comes from (a per-request loader over Postgres in the
 * app, hand-written fixtures in tests), so the MCP tools on top are
 * oblivious to the source.
 */

import type {
  Collection,
  ComponentRegion,
  ComponentType,
  ReferenceComponent,
  ScreenSummary,
} from "@m3-inspo/shared";
import type {
  CaptureDevice,
  Industry,
  Macrostructure,
  Mode,
  Style,
} from "@m3-inspo/taxonomy";
import type { ColorScheme } from "@m3-inspo/shared/color-scheme";
import { cosineSim } from "./vector";
import { isDamaged } from "./quality";

/** An approved Brand Kit: the owner's Color Scheme, stored with its snapshot, and their notes on it. */
export type ApprovedBrandKit = {
  slug: string;
  name: string;
  /** The owner tag of the project the kit applies to; at most one approved kit per project. */
  project: string | null;
  colorScheme: ColorScheme;
  notes: string | null;
  /** The owner's brand-specific design briefing, verbatim Markdown. */
  designBriefing: string | null;
};

/**
 * Everything the MCP tools read, built once per request by a loader.
 * Only references and Brand Kits the caller may see belong in here; the
 * tools do no visibility filtering of their own.
 */
export type Catalogue = {
  /** Screens in display order (latest capture first). Sub-pages of a
   *  site share its `siteSlug`. */
  screens: ScreenSummary[];
  /** Curated collections; entries point at screens by slug. */
  collections: Collection[];
  /** Canonical reference components for find_reference_components /
   *  get_reference_jsx. May be empty. */
  referenceComponents: ReferenceComponent[];
  /** Design embedding per screen slug. Rows without a vector (or a
   *  catalogue without any) fall back to tag and lexical ranking. */
  embeddings?: ReadonlyMap<string, Float32Array>;
  /** Approved Brand Kits only, by name. Their source references are
   *  named only when they are among `screens`. */
  brandKits: ApprovedBrandKit[];
};

export type ScreenFilter = {
  style?: Style;
  industry?: Industry;
  macrostructure?: Macrostructure;
  mode?: Mode;
  /** "mobile" restricts to rows with a mobile image (a mobile capture
   *  pair or a mobile reference's own screen). "desktop"
   *  is a no-op (every row has a desktop capture). */
  device?: CaptureDevice;
};

/* ──────────────────── screens ──────────────────── */

/** The catalogue's screens matching `filter`, in catalogue order. */
export function filterScreens(
  catalogue: Catalogue,
  filter: ScreenFilter = {},
): ScreenSummary[] {
  return catalogue.screens.filter((s) => {
    if (filter.style && !s.tags.style.includes(filter.style)) return false;
    if (filter.industry && !s.tags.industry.includes(filter.industry))
      return false;
    if (
      filter.macrostructure &&
      s.tags.macrostructure !== filter.macrostructure
    )
      return false;
    if (filter.mode && s.mode !== filter.mode) return false;
    if (filter.device === "mobile" && !s.mobileImageUrl) return false;
    return true;
  });
}

export function findScreen(
  catalogue: Catalogue,
  slug: string,
): ScreenSummary | null {
  return catalogue.screens.find((s) => s.slug === slug) ?? null;
}

export type FindSimilarOptions = {
  limit?: number;
  /** Include other pages of the target's own site (default false). */
  sameSite?: boolean;
};

export type SimilarResult = {
  results: ScreenSummary[];
  /** "embedding" when the catalogue's vectors ranked the list; "tags"
   *  when the target has no vector and the tag arithmetic ran. */
  method: "embedding" | "tags";
};

/** Dedupe a scored list to the best row per site, dropping the target's
 *  own site unless sameSite, and damaged captures always. */
function pickSimilar(
  scored: Array<{ s: ScreenSummary; score: number }>,
  target: ScreenSummary,
  limit: number,
  sameSite: boolean,
): ScreenSummary[] {
  scored.sort((a, b) => b.score - a.score);
  const seenSite = new Set<string>();
  const out: ScreenSummary[] = [];
  for (const { s } of scored) {
    if (s.slug === target.slug) continue;
    if (!sameSite && s.siteSlug === target.siteSlug) continue;
    if (isDamaged(s)) continue;
    if (seenSite.has(s.siteSlug)) continue;
    seenSite.add(s.siteSlug);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function similarByTags(
  all: ScreenSummary[],
  target: ScreenSummary,
  limit: number,
  sameSite: boolean,
): ScreenSummary[] {
  const scored = all.map((s) => {
    let score = 0;
    if (s.tags.macrostructure === target.tags.macrostructure) score += 4;
    if (s.mode === target.mode) score += 1;
    score +=
      s.tags.industry.filter((i) => target.tags.industry.includes(i)).length *
      2;
    score += s.tags.style.filter((i) => target.tags.style.includes(i)).length;
    return { s, score };
  });
  return pickSimilar(scored, target, limit, sameSite);
}

/** A screen's nearest neighbours, one per site. Empty for an unknown slug. */
export function findSimilar(
  catalogue: Catalogue,
  slug: string,
  opts: FindSimilarOptions = {},
): SimilarResult {
  const limit = opts.limit ?? 3;
  const sameSite = opts.sameSite ?? false;
  const all = catalogue.screens;
  const target = all.find((s) => s.slug === slug);
  if (!target) return { results: [], method: "tags" };

  // Cosine over per-row vectors when the target has one; tags act as a
  // small structural tiebreak on top. Falls back to pure tag arithmetic
  // when the target (or the whole catalogue) carries no vector.
  const vectors = catalogue.embeddings;
  const targetVec = vectors?.get(slug);
  if (vectors && targetVec) {
    const scored = all.flatMap((s) => {
      const vec = vectors.get(s.slug);
      if (!vec) return [];
      let score = cosineSim(targetVec, vec);
      if (s.tags.macrostructure === target.tags.macrostructure) score += 0.06;
      if (s.mode === target.mode) score += 0.02;
      score +=
        0.02 *
        Math.min(
          s.tags.style.filter((i) => target.tags.style.includes(i)).length,
          3,
        );
      return [{ s, score }];
    });
    return {
      results: pickSimilar(scored, target, limit, sameSite),
      method: "embedding",
    };
  }
  return {
    results: similarByTags(all, target, limit, sameSite),
    method: "tags",
  };
}

/* ──────────────────── sites ──────────────────── */

/** One website: the references sharing a host, in reading order. */
export type SiteSummary = {
  /** The slug of the site's first page (its landing page when there is one). */
  siteSlug: string;
  /** Absent for a reference without a source URL, which is a site of its own. */
  host?: string;
  title: string;
  designerCredit?: string;
  sourceUrl?: string;
  hero: ScreenSummary;
  pages: ScreenSummary[]; // includes hero - sorted by pageType priority
  pageCount: number;
};

const PAGE_TYPE_ORDER: Record<NonNullable<ScreenSummary["pageType"]>, number> = {
  landing: 0,
  pricing: 1,
  features: 2,
  auth: 3,
  about: 4,
  blog: 5,
  changelog: 6,
  docs: 7,
  other: 8,
};

function sortPages(pages: ScreenSummary[]): ScreenSummary[] {
  return [...pages].sort(
    (a, b) =>
      PAGE_TYPE_ORDER[a.pageType] - PAGE_TYPE_ORDER[b.pageType] ||
      a.capturedAt.localeCompare(b.capturedAt),
  );
}

/** The site made of `pages`, titled and keyed by its first page in reading order. */
function siteOf(pages: ScreenSummary[]): SiteSummary {
  const sorted = sortPages(pages);
  const hero = sorted[0]!;
  return {
    siteSlug: hero.slug,
    ...(hero.siteHost ? { host: hero.siteHost } : {}),
    title: hero.title,
    designerCredit: hero.designerCredit,
    sourceUrl: hero.sourceUrl,
    hero,
    pages: sorted,
    pageCount: sorted.length,
  };
}

/** The site of the screen with `slug`: every screen on its host, or the screen alone without one. Null for an unknown slug. */
export function findSite(
  catalogue: Catalogue,
  slug: string,
): SiteSummary | null {
  const screen = findScreen(catalogue, slug);
  if (!screen) return null;
  return siteOf(screen.siteHost ? catalogue.screens.filter((s) => s.siteHost === screen.siteHost) : [screen]);
}

/** Every host with more than one page in the catalogue, as a site. */
export function getMultiPageSites(catalogue: Catalogue): SiteSummary[] {
  const byHost = new Map<string, ScreenSummary[]>();
  for (const s of catalogue.screens) {
    if (!s.siteHost) continue;
    byHost.set(s.siteHost, [...(byHost.get(s.siteHost) ?? []), s]);
  }
  return [...byHost.values()].filter((pages) => pages.length > 1).map(siteOf);
}

/* ──────────────────── components ──────────────────── */

/** Map the 10 component types to the screen-level tags.components
 *  vocabulary, for the findComponents fallback when no per-element crop
 *  regions exist. 'cta' has no exact tag analogue, so it borrows
 *  hero-with-cta (which carries the primary CTA). */
const TYPE_TO_TAG_COMPONENTS: Record<ComponentType, string[]> = {
  nav: ["sticky-nav"],
  hero: ["hero-with-cta", "hero-fullbleed"],
  pricing: ["pricing-3-col"],
  features: ["feature-trio", "feature-alternating"],
  cta: ["hero-with-cta"],
  testimonial: ["testimonial-quote", "testimonial-wall"],
  "logo-cloud": ["logo-cloud", "marquee-logos"],
  footer: ["footer-compact"],
  faq: ["faq-accordion"],
  stat: ["stat-strip"],
};

export type ComponentHit = {
  screen: ScreenSummary;
  /** Position of the region within screen.components; -1 for tag-based
   *  fallback hits (no crop region). */
  idx: number;
  region: ComponentRegion;
  /** True when this came from the tags.components fallback: no region of
   *  the type is marked, the analysis tagged the whole page with it. */
  fallback?: boolean;
};

/** Browse / search component regions (on the library: the regions the
 *  owner marked, see loadCatalogue). Filters apply to the parent
 *  screen first; then we explode each screen's components and yield
 *  one hit per matching region.
 *
 *  Optional filters:
 *    type      - only this component type (hero | pricing | …)
 *    macrostructure / mode / style / industry - screen-level filters
 *
 *  Ordering: catalogue order, then components in the order they
 *  were marked.  */
export function findComponents(
  catalogue: Catalogue,
  opts: {
    type?: ComponentType;
    macrostructure?: Macrostructure;
    mode?: Mode;
    style?: Style;
    industry?: Industry;
    limit?: number;
  },
): ComponentHit[] {
  const all = filterScreens(catalogue, {
    macrostructure: opts.macrostructure,
    mode: opts.mode,
    style: opts.style,
    industry: opts.industry,
  });
  const out: ComponentHit[] = [];
  const limit = opts.limit ?? 60;
  for (const s of all) {
    s.components.forEach((region, idx) => {
      if (opts.type && region.type !== opts.type) return;
      if (out.length >= limit) return;
      out.push({ screen: s, idx, region });
    });
    if (out.length >= limit) break;
  }

  // Fallback: marked regions are sparse, so the region loop can come
  // back empty. Rather than return nothing for an advertised
  // tool, surface sites that carry the requested component type via
  // the screen-level tags.components vocabulary - one hit per site,
  // parent page thumb as the image, flagged so callers know there's no
  // crop.
  if (out.length === 0 && opts.type) {
    const seenSite = new Set<string>();
    const pushFallback = (s: ScreenSummary) => {
      seenSite.add(s.siteSlug);
      out.push({
        screen: s,
        idx: -1,
        region: { type: opts.type!, top: 0, left: 0, width: 0, height: 0 },
        fallback: true,
      });
    };
    const tagSet = TYPE_TO_TAG_COMPONENTS[opts.type] ?? [];
    if (tagSet.length) {
      for (const s of all) {
        if (out.length >= limit) break;
        if (s.slug !== s.siteSlug) continue; // one canonical row per site
        if (seenSite.has(s.siteSlug)) continue;
        if (s.tags.components.some((c) => tagSet.includes(c))) pushFallback(s);
      }
    }
    // Second fallback: a captured pricing/features PAGE is itself an
    // exemplar of that component type, even without a crop region or a
    // component tag on the canonical row.
    const TYPE_TO_PAGE_TYPE: Partial<Record<ComponentType, string>> = {
      pricing: "pricing",
      features: "features",
    };
    const pt = TYPE_TO_PAGE_TYPE[opts.type];
    if (pt) {
      for (const s of all) {
        if (out.length >= limit) break;
        if (seenSite.has(s.siteSlug)) continue;
        if (s.pageType === pt) pushFallback(s);
      }
    }
  }
  return out;
}

/* ──────────────────── collections ──────────────────── */

export function findCollection(
  catalogue: Catalogue,
  slug: string,
): Collection | null {
  return catalogue.collections.find((c) => c.slug === slug) ?? null;
}

/* ──────────────────── reference components ──────────────────── */

export function getReferenceComponents(
  catalogue: Catalogue,
  filter?: {
    type?: ReferenceComponent["type"];
    /** Case-insensitive substring match against the .macro field -
     *  "marquee" matches "Marquee Hero", "marquee with rail", etc. */
    macroQuery?: string;
  },
): ReferenceComponent[] {
  let list = catalogue.referenceComponents;
  if (filter?.type) list = list.filter((r) => r.type === filter.type);
  if (filter?.macroQuery) {
    const q = filter.macroQuery.toLowerCase();
    list = list.filter((r) => r.macro.toLowerCase().includes(q));
  }
  return list;
}

export function findReferenceComponent(
  catalogue: Catalogue,
  type: ReferenceComponent["type"],
  id: string,
): ReferenceComponent | null {
  return (
    catalogue.referenceComponents.find((r) => r.type === type && r.id === id) ??
    null
  );
}
