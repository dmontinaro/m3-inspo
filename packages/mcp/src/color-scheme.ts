/**
 * The wire format of a Color Scheme for agents: roles with hex, `oklch()`,
 * derivation and contrast, every scale, the warnings, the sources with
 * their origin and the CSS export. generate_color_scheme returns it for a
 * fresh scheme, get_brand_kit for a kit's stored snapshot.
 */

import { formatOklch, type ScreenSummary } from "@m3-inspo/shared";
import {
  ROLE_NAMES,
  exportCss,
  serializeGeneratorSearch,
  type ColorScheme,
  type GeneratorColor,
  type Pool,
  type SourceColor,
} from "@m3-inspo/shared/color-scheme";
import { absolute } from "./url";

/** The references a scheme's origins may name: the catalogue's. References not among them (drafts, archived, approved without capture) stay unnamed. */
type KnownReferences = readonly Pick<ScreenSummary, "id" | "slug" | "title">[];

const findReference = (references: KnownReferences, id: string | null) => references.find((reference) => reference.id === id);

/**
 * A source as agents read it: an origin from a reference names it by slug
 * and title (for get_screen) instead of its internal id, plus how the
 * colour was measured and the seed it was rolled with. A reference the
 * owner deleted reads `deleted: true`; one not in `references` is not named.
 */
function formatSource<T extends SourceColor>(source: T, references: KnownReferences) {
  if (source.origin.kind !== "reference") return source;
  const { referenceId, ...origin } = source.origin;
  if (referenceId === null) return { ...source, origin: { ...origin, deleted: true } };
  const reference = findReference(references, referenceId);
  return { ...source, origin: { ...origin, ...(reference ? { slug: reference.slug, title: reference.title } : {}) } };
}

export function formatColorScheme({ sources, primary, snapshot }: ColorScheme, references: KnownReferences) {
  return {
    primary,
    sources: {
      brand: formatSource(sources.brand, references),
      neutral: formatSource(sources.neutral, references),
      extras: sources.extras.map((extra) => formatSource(extra, references)),
    },
    roles: ROLE_NAMES.map((name) => {
      const { hex, derivation, contrast } = snapshot.roles[name];
      return { name, hex, oklch: formatOklch(hex), derivation, ...(contrast ? { contrast } : {}) };
    }),
    scales: snapshot.scales,
    warnings: snapshot.warnings,
    css: exportCss(snapshot),
  };
}

/**
 * Absolute link that opens these sources in the owner's generator, rolling
 * on from `seed` in `pool`. A colour from a reference carries its slug.
 */
export function generatorUrl(
  { sources, primary }: Pick<ColorScheme, "sources" | "primary">,
  seed: number,
  pool: Pool,
  references: KnownReferences,
): string {
  const urlColor = ({ hex, lock, origin }: SourceColor): GeneratorColor => {
    const slug = origin.kind === "reference" ? findReference(references, origin.referenceId)?.slug : undefined;
    return { hex, lock, ...(slug ? { reference: slug } : {}) };
  };
  const search = serializeGeneratorSearch({
    brand: urlColor(sources.brand),
    neutral: urlColor(sources.neutral),
    extras: sources.extras.map((extra) => ({ name: extra.name, ...urlColor(extra) })),
    primary,
    seed,
    pool,
  });
  return absolute(`/generator?${search}`);
}
