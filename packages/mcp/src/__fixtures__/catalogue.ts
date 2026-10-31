/**
 * A small, fictional catalogue for the MCP tests. Every site, colour and
 * note here is invented; nothing is taken from the Inspo catalogue.
 *
 *   fjord-lodge   boutique hotel, three pages (landing, pricing, about)
 *   ledgerline    dark fintech dashboard
 *   salt-and-rye  neighbourhood bakery
 *   kiln-studio   architecture portfolio
 *
 * Embeddings are tiny hand-made vectors: salt-and-rye sits next to
 * fjord-lodge, the other two point elsewhere.
 */

import type { Catalogue } from "@m3-inspo/db";
import type { ScreenSummary } from "@m3-inspo/shared";
import type { Asset } from "../inline-images";

type ScreenInput = Pick<
  ScreenSummary,
  "slug" | "title" | "palette" | "fonts" | "mode" | "description"
> &
  Partial<ScreenSummary>;

/** Fills the fields every fixture row shares, so each row below only
 *  states what makes it distinct. */
export function screen(input: ScreenInput): ScreenSummary {
  const assets = `/api/assets/${input.slug}`;
  const host = `${input.siteSlug ?? input.slug}.example`;
  return {
    id: input.slug,
    sourceUrl: `https://${host}`,
    siteHost: host,
    capturedAt: "2026-09-01",
    imageUrl: `${assets}/hero.webp`,
    fullPageUrl: `${assets}/full.webp`,
    thumbUrl: `${assets}/thumb.webp`,
    tech: [],
    tags: { style: [], industry: [], components: [], vibe: [] },
    designSystem: {
      typeRamp: [],
      spacingScale: [],
      radiusScale: [],
      containerWidth: null,
      cssVariables: {},
      colorWords: [],
    },
    siteSlug: input.slug,
    pageType: "landing",
    components: [],
    ...input,
  };
}

const fjordLodge = screen({
  slug: "fjord-lodge",
  title: "Fjord Lodge",
  description: "Boutique hotel on a quiet fjord. Serif headlines on warm paper, one rust accent, generous whitespace.",
  northstar: "A handwritten welcome letter from the innkeeper.",
  layoutSummary: "Full-bleed lake photo under a slim nav, then three room cards, then a quiet footer.",
  provenance: { palette: "dom" },
  taste: { take: "Typografie ja", avoid: "Farben nein", focus: "Hero", isFavorite: false, tags: ["sample-project"] },
  palette: ["#f4efe6", "#1f2a2e", "#c7402f", "#8a9a8c"],
  fonts: ["Canela", "Inter"],
  tech: ["Astro"],
  mode: "light",
  tags: {
    style: ["minimalism", "editorial"],
    industry: ["travel"],
    components: ["sticky-nav", "hero-with-cta", "footer-compact"],
    vibe: ["calm", "luxe"],
    macrostructure: "feature-stack",
    axes: {
      paperBand: "light",
      displayClass: "roman-serif",
      accentHue: "warm",
      paperL: 94,
      accentDeg: 32,
      displayFace: "Canela",
    },
  },
  designSystem: {
    typeRamp: [
      { role: "h1", family: "Canela", sizePx: 64, weight: 400, lineHeight: 1.05, letterSpacing: "-0.01em" },
      { role: "body", family: "Inter", sizePx: 17, weight: 400, lineHeight: 1.55, letterSpacing: "0" },
    ],
    spacingScale: [8, 16, 24, 48, 96],
    radiusScale: [2],
    containerWidth: 1120,
    cssVariables: { "--paper": "#f4efe6", "--ink": "#1f2a2e", "--accent": "#c7402f" },
    colorWords: ["warm", "earthy"],
  },
  // A region the owner marked.
  components: [
    {
      type: "nav",
      top: 0,
      left: 0,
      width: 1280,
      height: 72,
      note: "Schmale Leiste, Buchen rechts",
      imageUrl: "/api/assets/fjord-lodge/regions/nav.webp",
      thumbUrl: "/api/assets/fjord-lodge/regions/nav.thumb.webp",
    },
  ],
});

const fjordLodgePricing = screen({
  slug: "fjord-lodge-pricing",
  siteSlug: "fjord-lodge",
  pageType: "pricing",
  title: "Fjord Lodge - Rooms & rates",
  description: "Three room types as cards with seasonal rates.",
  palette: fjordLodge.palette,
  fonts: fjordLodge.fonts,
  mode: "light",
  tags: { ...fjordLodge.tags, components: ["pricing-3-col"] },
  components: [{ type: "pricing", top: 640, left: 0, width: 1280, height: 520, label: "Room cards" }],
});

const fjordLodgeAbout = screen({
  slug: "fjord-lodge-about",
  siteSlug: "fjord-lodge",
  pageType: "about",
  title: "Fjord Lodge - Our story",
  description: "The family behind the lodge, told in long-form paragraphs.",
  palette: fjordLodge.palette,
  fonts: fjordLodge.fonts,
  mode: "light",
  tags: { ...fjordLodge.tags, components: [] },
});

const ledgerline = screen({
  slug: "ledgerline",
  title: "Ledgerline",
  description: "Dark finance dashboard for small teams. Monospace numerals, a single blue accent, dense tables.",
  northstar: "A trading terminal that learned good manners.",
  palette: ["#0b0d10", "#e8eaed", "#3b82f6"],
  fonts: ["Geist", "Geist Mono"],
  mode: "dark",
  tags: {
    style: ["swiss", "dark-mode"],
    industry: ["fintech", "saas"],
    components: ["sticky-nav", "hero-with-cta", "stat-strip", "pricing-3-col"],
    vibe: ["technical", "serious"],
    macrostructure: "feature-stack",
    axes: {
      paperBand: "dark",
      displayClass: "grotesk-sans",
      accentHue: "cool",
      paperL: 8,
      accentDeg: 262,
      displayFace: "Geist",
    },
  },
  designSystem: { ...fjordLodge.designSystem, colorWords: ["cool", "high-contrast"] },
});

const saltAndRye = screen({
  slug: "salt-and-rye",
  title: "Salt & Rye",
  description: "Neighbourhood bakery with big photos of bread, a hand-drawn logo and a warm cream background.",
  // A screenshot: its palette is the AI analysis's estimate, and nothing else was measured.
  provenance: {
    palette: [
      { value: "#fbf3e4", source: "vision", confidence: 0.9 },
      { value: "#3a2618", source: "vision", confidence: 0.8 },
      { value: "#d9822b", source: "vision", confidence: 0.6 },
    ],
  },
  palette: ["#fbf3e4", "#3a2618", "#d9822b"],
  fonts: ["Recoleta", "Work Sans"],
  mode: "light",
  tags: {
    style: ["vintage", "editorial"],
    industry: ["food-beverage"],
    components: ["hero-fullbleed", "footer-compact"],
    vibe: ["warm", "soft"],
    macrostructure: "photographic",
  },
});

const kilnStudio = screen({
  slug: "kiln-studio",
  title: "Kiln Studio",
  description: "Architecture studio portfolio. Raw grid of project photos, black on white, one signal orange.",
  palette: ["#ffffff", "#111111", "#ff3b00"],
  fonts: ["Neue Haas Grotesk"],
  mode: "light",
  tags: {
    style: ["brutalism"],
    industry: ["architecture", "portfolio"],
    components: ["sticky-nav"],
    vibe: ["raw"],
    macrostructure: "portfolio-grid",
  },
});

export const fixtureCatalogue: Catalogue = {
  screens: [fjordLodge, fjordLodgePricing, fjordLodgeAbout, ledgerline, saltAndRye, kilnStudio],
  collections: [
    {
      id: "c1",
      slug: "quiet-hospitality",
      title: "Quiet hospitality",
      number: "01",
      date: "2026-09-01",
      description: "Places that whisper instead of shout.",
      project: "sample-project",
      coverScreenSlug: "fjord-lodge",
      screens: [
        { slug: "fjord-lodge", editorNote: "Serif welcome on warm paper." },
        { slug: "salt-and-rye" },
      ],
    },
  ],
  referenceComponents: [
    {
      id: "split-welcome",
      type: "hero",
      label: "Split welcome",
      macro: "Feature Stack split",
      note: "Headline left, one calm photo right.",
      source: [
        "/**",
        " * Two-column hero: headline and booking button left, one photo right.",
        " */",
        "export function SplitWelcome() {",
        '  return <section className="grid grid-cols-2" />;',
        "}",
      ].join("\n"),
    },
  ],
  embeddings: new Map([
    ["fjord-lodge", Float32Array.of(1, 0, 0)],
    ["fjord-lodge-pricing", Float32Array.of(1, 0, 0)],
    ["fjord-lodge-about", Float32Array.of(1, 0, 0)],
    ["salt-and-rye", Float32Array.of(0.9, 0.1, 0)],
    ["ledgerline", Float32Array.of(0, 1, 0)],
    ["kiln-studio", Float32Array.of(0, 0, 1)],
  ]),
  brandKits: [],
};

export const emptyCatalogue: Catalogue = {
  screens: [],
  collections: [],
  referenceComponents: [],
  brandKits: [],
};

/** The bytes every fixture thumbnail resolves to. */
export const FIXTURE_IMAGE: Asset = {
  data: Uint8Array.of(1, 2, 3),
  mimeType: "image/webp",
};

/** Serves the thumbnails of the fixture rows and nothing else. */
export async function readFixtureAsset(ref: string): Promise<Asset | null> {
  return fixtureCatalogue.screens.some((s) => s.thumbUrl === ref)
    ? FIXTURE_IMAGE
    : null;
}
