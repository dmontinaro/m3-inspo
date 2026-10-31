/**
 * Lexical search — substring match across title, description, search
 * keywords, fonts, palette, css variable keys, designer credit, every
 * tag value and the owner's own words in `taste`: tags and the take and
 * avoid notes. Used by the MCP `search_screens` and `recommend`
 * tools over the catalogue's screens.
 *
 * Scope: this is intentionally a small in-memory ranker; at our seed
 * scale (≤500 rows) the cost of pulling all screens then filtering in
 * JS is sub-millisecond. When the catalogue grows past ~5K rows, swap
 * for a Postgres full-text index + pgvector rerank — same function
 * signature, different inside.
 *
 * `searchScreens` (async) adds a vector ranking to the lexical one: it
 * embeds the query, compares it with the vectors the caller passes (the
 * catalogue's `embeddings`) and fuses both rankings by rank. Degrades
 * cleanly to lexical-only when no vectors are passed or the embedding
 * call fails. `rankForBrief` fuses the same two rankings and then lifts
 * the owner's favourites and note matches, for `recommend`.
 */

import type { ScreenSummary } from "@m3-inspo/shared";
import { RRF_K, cosineSim, embedQuery, fuseRankings, minQuerySimilarity } from "./vector";
import { isLowQuality } from "./quality";

const URL_RE = /^https?:\/\//i;

export function isUrl(query: string): boolean {
  return URL_RE.test(query.trim());
}

/** Pull a comparable hostname out of a query that looks like a URL. */
export function hostnameOf(maybeUrl: string): string | null {
  try {
    const u = new URL(maybeUrl.trim());
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Match a query URL against the catalogue by hostname. */
export function findByHostname(
  screens: ScreenSummary[],
  query: string,
): ScreenSummary | null {
  const target = hostnameOf(query);
  if (!target) return null;
  return (
    screens.find((s) => {
      const h = s.sourceUrl ? hostnameOf(s.sourceUrl) : null;
      return h === target || (h && (h.endsWith("." + target) || target.endsWith("." + h)));
    }) ?? null
  );
}

export function lexicalSearch(
  screens: ScreenSummary[],
  query: string,
  limit: number,
): ScreenSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return screens.slice(0, limit);
  const tokens = queryTokens(q);

  const scored = screens.map((s) => ({ s, score: lexicalScore(s, tokens) }));

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/**
 * Hybrid lexical + vector search, best first, one row per site.
 *
 *   1. Lexical: every row with a lexical score, best first.
 *   2. Vector: embed the query (cached) and rank the rows that have a
 *      vector in `vectors` (keyed by slug) by cosine, keeping those at or
 *      above `minQuerySimilarity`, at most `vectorCandidates` of them.
 *   3. Fuse both rankings with reciprocal rank fusion (`fuseRankings`):
 *      a row found by the words and by the meaning comes first, a row
 *      only one of them finds still makes the list. A German briefing
 *      reaches a reference tagged in English this way.
 *   4. Low-quality captures drop behind the rest (kept, not excluded),
 *      then one row per site, up to `limit`.
 *
 * Without vectors, without a key or when the embedding call fails, step 2
 * is empty and the result is the lexical ranking.
 */
export async function searchScreens(
  screens: ScreenSummary[],
  query: string,
  limit: number,
  vectors?: ReadonlyMap<string, Float32Array>,
): Promise<ScreenSummary[]> {
  const q = query.trim().toLowerCase();
  if (!q) return screens.slice(0, limit);

  // Low-quality captures (vision-scored) are down-weighted, not excluded:
  // they stay reachable when they are genuinely the match.
  const tokens = queryTokens(q);
  const lexical = screens
    .map((s) => ({ s, score: lexicalScore(s, tokens) * (isLowQuality(s) ? 0.5 : 1) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s.slug);

  const semantic = (await nearest(screens, q, vectors)).map((x) => x.slug);

  const bySlug = new Map(screens.map((s) => [s.slug, s]));
  const ranked = fuseRankings(lexical, semantic).flatMap((slug) => bySlug.get(slug) ?? []);
  const ordered = [...ranked.filter((s) => !isLowQuality(s)), ...ranked.filter((s) => isLowQuality(s))];
  return onePerSite(ordered).slice(0, limit);
}

/**
 * How much the owner's taste lifts a reference in `rankForBrief`, as a
 * share of its search relevance. Reciprocal-rank scores lie close together
 * (rank 1 ≈ 0.0164, rank 4 ≈ 0.0156), so 5% decides ties and moves a
 * reference up about three places, never from the bottom to the top.
 * Judge again on a real briefing (docs/umsetzungsplan.md, Risiken).
 */
const TASTE_BOOST = {
  /** A favourite counts 1.05 times as relevant. */
  favorite: 0.05,
  /** A brief word of 4+ letters in the take or focus note adds another 0.05. */
  note: 0.05,
} as const;

/**
 * The references in `screens` that fit `brief`, best first, one per site:
 * the ranking behind the MCP `recommend` tool.
 *
 *   relevance = sum of 1 / (RRF_K + rank) over the text ranking and the
 *               vector ranking (reciprocal rank fusion as in
 *               `searchScreens`; equal scores share a rank, so equally
 *               relevant references stay equal)
 *   score     = relevance × (1 + TASTE_BOOST.favorite for a favourite
 *                              + TASTE_BOOST.note when a brief word is
 *                                in its take or focus note)
 *
 * Only references the search finds are ranked: taste reorders relevant
 * references and never adds an unrelated one. No quality weighting and no
 * other opinion about what makes a good reference.
 */
export async function rankForBrief(
  screens: ScreenSummary[],
  brief: string,
  vectors?: ReadonlyMap<string, Float32Array>,
): Promise<ScreenSummary[]> {
  const q = brief.trim().toLowerCase();
  const tokens = queryTokens(q);
  if (tokens.length === 0) return [];

  const lexical = screens
    .map((s) => ({ slug: s.slug, value: lexicalScore(s, tokens) }))
    .filter((x) => x.value > 0);
  const semantic = (await nearest(screens, q, vectors)).map(({ slug, similarity }) => ({ slug, value: similarity }));
  const relevance = new Map<string, number>();
  for (const ranking of [lexical, semantic]) {
    for (const [slug, rank] of sharedRanks(ranking)) {
      relevance.set(slug, (relevance.get(slug) ?? 0) + 1 / (RRF_K + rank));
    }
  }

  const noteWords = tokens.filter((t) => t.length >= 4);
  const scored = screens.flatMap((s) => {
    const base = relevance.get(s.slug);
    if (!base) return [];
    const notes = `${s.taste?.take ?? ""} ${s.taste?.focus ?? ""}`.toLowerCase();
    const boost =
      1 +
      (s.taste?.isFavorite ? TASTE_BOOST.favorite : 0) +
      (noteWords.some((w) => notes.includes(w)) ? TASTE_BOOST.note : 0);
    return [{ s, score: base * boost }];
  });
  return onePerSite(scored.sort((a, b) => b.score - a.score).map((x) => x.s));
}

/** Rank per slug, best value first, counted from 1; equal values share the better rank. */
function sharedRanks(values: { slug: string; value: number }[]): Map<string, number> {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  sorted.forEach(({ slug, value }, index) => {
    const previous = sorted[index - 1];
    ranks.set(slug, previous?.value === value ? ranks.get(previous.slug)! : index + 1);
  });
  return ranks;
}

/** The first row of each site, in order: sub-pages of one site would
 *  otherwise crowd out other sites, and agents want one example per brand. */
function onePerSite(screens: ScreenSummary[]): ScreenSummary[] {
  const seen = new Set<string>();
  return screens.filter((s) => {
    if (seen.has(s.siteSlug)) return false;
    seen.add(s.siteSlug);
    return true;
  });
}

/** How many rows the vector side of a search contributes at most. */
const vectorCandidates = 24;

/**
 * The rows closest in meaning to `query`, best first, at or above
 * `minQuerySimilarity`. Empty without vectors, without a key or when the
 * embedding call fails; the query is only embedded when there is
 * something to compare it with.
 */
async function nearest(
  screens: ScreenSummary[],
  query: string,
  vectors?: ReadonlyMap<string, Float32Array>,
): Promise<{ slug: string; similarity: number }[]> {
  const queryVector = vectors && vectors.size > 0 ? await embedQuery(query) : null;
  if (!queryVector || !vectors) return [];
  return screens
    .flatMap((s) => {
      const vector = vectors.get(s.slug);
      const similarity = vector ? cosineSim(queryVector, vector) : 0;
      return similarity >= minQuerySimilarity ? [{ slug: s.slug, similarity }] : [];
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, vectorCandidates);
}

/** Extracted lexical scoring used by both `lexicalSearch` and the
 *  hybrid `searchScreens`. Keeps the two ranking paths in lockstep. */
/** German and English filler words: matched as substrings ("ein" in "keine") they would make any note look relevant. */
const STOPWORDS = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "und", "oder", "mit", "für",
  "von", "vom", "zu", "zum", "zur", "im", "in", "an", "am", "auf", "aus", "bei", "nach", "über", "wie", "als",
  "the", "a", "an", "and", "or", "with", "for", "of", "to", "in", "on", "at", "by", "from", "like",
]);

/** The words of a lowercased query that can say something: split at spaces and punctuation, filler words dropped. */
function queryTokens(q: string): string[] {
  return q.split(/[\s,.;:!?()"']+/).filter((token) => token && !STOPWORDS.has(token));
}

function lexicalScore(s: ScreenSummary, tokens: string[]): number {
  const cssVarKeys = Object.keys(s.designSystem?.cssVariables ?? {}).join(" ");
  const colorWords = (s.designSystem?.colorWords ?? []).join(" ");
  // Stored lowercase (apps/web/src/lib/tags.ts).
  const ownerTags = s.taste?.tags ?? [];
  const haystack = [
    s.title,
    s.description,
    s.designerCredit ?? "",
    s.tags.style.join(" "),
    s.tags.industry.join(" "),
    s.tags.components.join(" "),
    s.tags.vibe.join(" "),
    s.tags.macrostructure ?? "",
    s.tags.axes
      ? `${s.tags.axes.paperBand} ${s.tags.axes.displayClass} ${s.tags.axes.accentHue}`
      : "",
    s.fonts.join(" "),
    s.tech.join(" "),
    s.palette.join(" "),
    colorWords,
    cssVarKeys,
    ownerTags.join(" "),
    s.taste?.take ?? "",
    s.taste?.avoid ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 1;
    if (s.title.toLowerCase().includes(t)) score += 2;
    if ((s.tags.macrostructure ?? "").toLowerCase().includes(t)) score += 1.5;
    if (s.tags.style.some((x) => x.toLowerCase().includes(t))) score += 1;
    if (s.tags.industry.some((x) => x.toLowerCase().includes(t))) score += 1;
    if ((s.designerCredit ?? "").toLowerCase().includes(t)) score += 1.5;
    // The owner tagged it themselves, e.g. with a project: as telling as a credit.
    if (ownerTags.some((x) => x.includes(t))) score += 1.5;
  }
  return score;
}
