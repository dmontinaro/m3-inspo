/**
 * The catalogue the MCP tools read, loaded from the library per request so
 * every change (a note, a new upload, an archived reference) shows on the
 * next call without cache invalidation (docs/spec.md, Katalog).
 *
 * ```ts
 * const catalogue = await loadCatalogue(getDb());
 * const server = createServer({ catalogue, readAsset });
 * ```
 */

import { sql } from "drizzle-orm";
import type { Collection, FieldProvenance, PageType, ScreenSummary, Sourced, TokenField } from "@m3-inspo/shared";
import type { Database } from "./client";
import type { AnalysisTokens, CaptureVariants } from "./library-schema";
import type { Catalogue } from "./queries";
import { embeddingModel } from "./vector";

/**
 * Where the web app serves stored images (apps/web/src/routes/api/assets/$.ts):
 * `${assetsPath}${storage key}`. Catalogue image references use this form, so
 * agents get URLs the owner can open, and the app's asset reader maps them
 * back to storage keys.
 */
export const assetsPath = "/api/assets/";

type Capture = { viewport: string; kind: string; assetKey: string; thumbKey: string; variants: CaptureVariants; createdAt: Date };

/**
 * The captures in their screen roles: the main image (desktop hero, else the
 * first capture, e.g. an upload), the full page and the mobile view. A role
 * without a capture stays empty, except the full page, which falls back to
 * the main image.
 */
function captureRoles(captures: Capture[]) {
  const find = (viewport: string, kind: string) =>
    captures.find((capture) => capture.viewport === viewport && capture.kind === kind);
  const [first] = captures;
  const main = find("desktop", "hero") ?? find("desktop", "full") ?? first;
  if (!main) return null;
  return {
    main,
    full: find("desktop", "full") ?? main,
    mobile: find("mobile", "hero") ?? find("mobile", "full"),
    mobileFull: find("mobile", "full"),
  };
}

const values = <T>(list: Sourced<T>[] = []) => list.map((token) => token.value);

/**
 * Each field's provenance: its one source when every value shares it and
 * none is an estimate with a confidence, else every value with its own
 * source and confidence. Fields without values are left out.
 */
function provenanceOf(tokens: AnalysisTokens): ScreenSummary["provenance"] {
  const fields: [TokenField, Sourced<unknown>[] | undefined][] = [
    ["palette", tokens.palette],
    ["fonts", tokens.fonts],
    ["typeRamp", tokens.typeRamp],
    ["spacingScale", tokens.spacingScale],
    ["radiusScale", tokens.radiusScale],
    ["containerWidth", tokens.containerWidth && [tokens.containerWidth]],
    [
      "cssVariables",
      tokens.cssVariables &&
        Object.entries(tokens.cssVariables).map(([name, token]) => ({ ...token, value: `${name}: ${token.value}` })),
    ],
  ];
  const provenance: Partial<Record<TokenField, FieldProvenance>> = {};
  for (const [field, list = []] of fields) {
    const [first] = list;
    if (!first) continue;
    const uniform = list.every((token) => token.source === first.source && token.confidence === undefined);
    provenance[field] = uniform ? first.source : list;
  }
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

/** Leading path segments that name a page's kind; matched lowercase. */
const pageTypePaths: [RegExp, PageType][] = [
  [/^(pricing|preise|plans|tarife)$/, "pricing"],
  [/^(features|funktionen|product|produkt)$/, "features"],
  [/^(login|signin|sign-in|signup|sign-up|register|anmelden|registrieren)$/, "auth"],
  [/^(about|about-us|ueber-uns|team|company)$/, "about"],
  [/^(blog|news|journal|magazin)$/, "blog"],
  [/^(changelog|releases)$/, "changelog"],
  [/^(docs|documentation|dokumentation|help|hilfe)$/, "docs"],
];

/**
 * The page kind a source URL suggests, for ordering a site's pages: the
 * root (after an optional language segment such as `/de`) is the landing
 * page, a known first segment names its kind, anything else is `other`.
 */
function pageTypeOf(sourceUrl: string | null): PageType {
  if (!sourceUrl) return "other";
  const segments = new URL(sourceUrl).pathname.toLowerCase().split("/").filter(Boolean);
  const [first] = /^[a-z]{2}(-[a-z]{2})?$/.test(segments[0] ?? "") ? segments.slice(1) : segments;
  if (!first) return "landing";
  return pageTypePaths.find(([pattern]) => pattern.test(first))?.[1] ?? "other";
}

/**
 * All approved references that have a capture, newest first, as screen
 * summaries, and every collection (alphabetically) with just those of them
 * in the owner's order. Drafts and archived references are left out; the
 * tools do no visibility filtering of their own.
 *
 * Title, notes and owner tags (`taste`), images and dates come from the
 * library. Design values (palette, fonts, tech, mode, design system) come
 * from the reference's current analysis with their `provenance`; without
 * one they stay empty or absent, never guessed. So do the AI analysis's tags,
 * macrostructure and (English) description and layout summary. `embeddings` holds each
 * reference's vector from the current embedding model, for hybrid search and
 * `find_similar`; references without one rank by words and tags only.
 * `components` holds the regions the owner marked, in marking order, each
 * with its component type, note and crop. `brandKits` holds the approved
 * Brand Kits by name, drafts and archived kits left out.
 */
export async function loadCatalogue(db: Database): Promise<Catalogue> {
  const [rows, collectionRows, brandKits] = await Promise.all([
    db.query.references.findMany({
      where: (reference, { eq }) => eq(reference.curationStatus, "approved"),
      // The id breaks ties, so the order (and with it a seeded roll from the pool) is stable.
      orderBy: (reference, { desc }) => [desc(reference.createdAt), desc(reference.id)],
      with: {
        captures: { orderBy: (capture, { asc }) => [asc(capture.createdAt)] },
        regions: { orderBy: (region, { asc }) => [asc(region.createdAt)] },
        analyses: { orderBy: (analysis, { desc }) => [desc(analysis.version)], limit: 1 },
        embedding: { columns: { model: true, embedding: true } },
      },
    }),
    db.query.collections.findMany({
      orderBy: (collection) => [sql`lower(${collection.name})`, collection.createdAt],
      with: {
        entries: {
          columns: {},
          orderBy: (entry, { asc }) => [asc(entry.position)],
          with: { reference: { columns: { slug: true } } },
        },
      },
    }),
    db.query.brandKits.findMany({
      columns: { slug: true, name: true, project: true, colorScheme: true, notes: true, designBriefing: true },
      where: (kit, { eq }) => eq(kit.status, "approved"),
      orderBy: (kit) => [sql`lower(${kit.name})`, kit.slug],
    }),
  ]);

  const model = embeddingModel();
  const embeddings = new Map<string, Float32Array>();
  const screens = rows.flatMap(({ captures, regions, analyses: [analysis], embedding, ...reference }): ScreenSummary[] => {
    const roles = captureRoles(captures);
    if (!roles) return [];
    // A mobile reference without a phone capture of its own (an uploaded app screen) is its own mobile view.
    const mobile = roles.mobile ?? (reference.device === "mobile" ? roles.main : undefined);
    if (embedding?.model === model) embeddings.set(reference.slug, Float32Array.from(embedding.embedding));
    const tokens = analysis?.tokens ?? {};
    const provenance = provenanceOf(tokens);
    return [
      {
        id: reference.id,
        slug: reference.slug,
        title: reference.title,
        ...(reference.sourceUrl ? { sourceUrl: reference.sourceUrl } : {}),
        ...(reference.attribution ? { designerCredit: reference.attribution } : {}),
        capturedAt: roles.main.createdAt.toISOString(),
        imageUrl: `${assetsPath}${roles.main.variants.preview.key}`,
        fullPageUrl: `${assetsPath}${roles.full.assetKey}`,
        thumbUrl: `${assetsPath}${roles.main.thumbKey}`,
        ...(mobile ? { mobileImageUrl: `${assetsPath}${mobile.variants.preview.key}` } : {}),
        ...(roles.mobileFull ? { mobileFullUrl: `${assetsPath}${roles.mobileFull.assetKey}` } : {}),
        description: analysis?.description?.en ?? "",
        ...(analysis?.layoutSummary ? { layoutSummary: analysis.layoutSummary.en } : {}),
        palette: values(tokens.palette),
        fonts: values(tokens.fonts),
        tech: analysis?.tech ?? [],
        ...(analysis?.mode ? { mode: analysis.mode } : {}),
        tags: {
          style: analysis?.tags?.style ?? [],
          industry: analysis?.tags?.industry ?? [],
          components: analysis?.tags?.components ?? [],
          vibe: analysis?.tags?.vibe ?? [],
          ...(analysis?.macrostructure ? { macrostructure: analysis.macrostructure } : {}),
        },
        designSystem: {
          typeRamp: values(tokens.typeRamp),
          spacingScale: values(tokens.spacingScale),
          radiusScale: values(tokens.radiusScale),
          containerWidth: tokens.containerWidth?.value ?? null,
          cssVariables: Object.fromEntries(
            Object.entries(tokens.cssVariables ?? {}).map(([name, token]) => [name, token.value]),
          ),
          colorWords: analysis?.tags?.colorWords ?? [],
        },
        // Every reference counts as its own site for the list tools (one
        // result per site), so a second page of a website keeps its own
        // notes in recommend and search. get_site_pages groups by `siteHost`.
        siteSlug: reference.slug,
        ...(reference.siteHost ? { siteHost: reference.siteHost.replace(/^www\./, "") } : {}),
        pageType: pageTypeOf(reference.sourceUrl),
        components: regions.map((region) => ({
          type: region.componentType,
          left: region.x,
          top: region.y,
          width: region.width,
          height: region.height,
          note: region.note,
          imageUrl: `${assetsPath}${region.cropKey}`,
          thumbUrl: `${assetsPath}${region.thumbKey}`,
        })),
        taste: {
          take: reference.takeNote,
          avoid: reference.avoidNote,
          focus: reference.focus,
          isFavorite: reference.isFavorite,
          tags: reference.tags,
        },
        ...(provenance ? { provenance } : {}),
      },
    ];
  });

  const visible = new Set(screens.map((screen) => screen.slug));
  const collections = collectionRows.map((collection, index): Collection => {
    const members = collection.entries.map(({ reference }) => reference.slug).filter((slug) => visible.has(slug));
    return {
      id: collection.id,
      slug: collection.slug,
      title: collection.name,
      description: collection.description ?? "",
      project: collection.project,
      number: String(index + 1).padStart(2, "0"),
      date: collection.updatedAt.toISOString().slice(0, 10),
      coverScreenSlug: members[0] ?? "",
      screens: members.map((slug) => ({ slug })),
    };
  });

  // No code templates are maintained yet (docs/spec.md, Codevorlage); the
  // template tools say so instead of serving the original Inspo's.
  return { screens, collections, referenceComponents: [], embeddings, brandKits };
}
