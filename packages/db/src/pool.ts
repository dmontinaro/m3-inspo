/**
 * The pool (spec #44, "Pool"): the approved references the generator rolls
 * from and the colours of their measured palettes. Built on the catalogue,
 * which holds approved references only, so drafts and archived references
 * never enter, not even when named by slug. The web app's generator and
 * generate_color_scheme share it.
 *
 * ```ts
 * const { references, colors } = selectPool(await loadCatalogue(db), { kind: "project", tag: "harbor" });
 * const sources = rollSources(current, { pool: colors, seed, primary });
 * ```
 */

import { normalizeHex, type ScreenSummary } from "@m3-inspo/shared";
import type { Pool, PoolColor } from "@m3-inspo/shared/color-scheme";
import { findCollection, type Catalogue } from "./queries";

/** The references a pool names, in the catalogue's order (newest first), a collection's in the owner's order, slugs in the order given. */
function poolReferences(catalogue: Catalogue, pool: Pool): ScreenSummary[] {
  const bySlug = (slugs: string[]) => slugs.flatMap((slug) => catalogue.screens.find((screen) => screen.slug === slug) ?? []);
  switch (pool.kind) {
    case "all":
      return catalogue.screens;
    case "project": {
      // Owner tags are stored trimmed and lowercase (apps/web/src/lib/tags.ts).
      const tag = pool.tag.trim().replace(/\s+/g, " ").toLowerCase();
      return catalogue.screens.filter((screen) => screen.taste?.tags.includes(tag));
    }
    case "collection":
      return bySlug(findCollection(catalogue, pool.slug)?.screens.map((entry) => entry.slug) ?? []);
    case "references":
      // A slug named twice still counts once, so its colours do not weigh double.
      return bySlug([...new Set(pool.slugs)]);
  }
}

/**
 * The pool's references and every palette colour they carry that was read
 * from the DOM or estimated by the vision model (both count the same), with
 * the reference's id and how it was measured. An unknown project,
 * collection or slug simply adds nothing; an empty pool makes the
 * generator roll freely.
 */
export function selectPool(catalogue: Catalogue, pool: Pool): { references: ScreenSummary[]; colors: PoolColor[] } {
  const references = poolReferences(catalogue, pool);
  const colors = references.flatMap(({ id, palette, provenance }) =>
    palette.flatMap((value, index): PoolColor[] => {
      const source = typeof provenance?.palette === "string" ? provenance.palette : provenance?.palette?.[index]?.source;
      const hex = normalizeHex(value);
      return hex && (source === "dom" || source === "vision") ? [{ hex, measuredBy: source, referenceId: id }] : [];
    }),
  );
  return { references, colors };
}
