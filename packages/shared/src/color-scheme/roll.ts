/**
 * Rolling (spec #44, "Würfeln"): new source colours drawn from the pool,
 * the measured palettes of the owner's approved references, with a seed.
 *
 *   const sources = completeSources({ brand, extras: [] }, { pool, seed, primary: "vivid" }); // fill what is missing
 *   const next = rollSources(sources, { pool, seed: randomSeed(), primary }); // space bar: every unlocked colour
 *   const added = rollSources(withNewExtra, { pool, seed, primary, only: 2 }); // just the extra at index 2
 *
 * Per colour: sample pool colours of the right kind, drop those too close to
 * the other sources (and, for extras, too close in hue), rank the rest by
 * how distinct they are, keep the best ten whose roles keep their contrast
 * and pick one of them at random. A single-hue pool leaves extras without a
 * candidate; then harmony hues around the brand, with lightness and chroma
 * from the pool, step in. Without fitting pool colours the roll is free
 * (origin `rolled`, no reference).
 */

import { colorDistanceHex, hexToOklch, oklchToHex, type OkLch } from "../color";
import { NEUTRAL_CHROMA, hueDiff } from "./scale";
import {
  buildColorScheme,
  type ColorSources,
  type ExtraColor,
  type PrimaryStrategy,
  type RoleName,
  type SourceColor,
  type SourceOrigin,
} from "./scheme";

/** A colour from a reference's measured palette; the pool is a list of these. */
export type PoolColor = { hex: string; measuredBy: "dom" | "vision"; referenceId: string };

/** One source colour: the brand, the neutral or the extra at this index. */
export type SourceKey = "brand" | "neutral" | number;

/** What every roll needs: the pool (may be empty), the seed and the `primary` strategy the contrast check builds with. */
export type RollOptions = { pool: readonly PoolColor[]; seed: number; primary: PrimaryStrategy };

/** Sources before rolling: a missing brand or neutral is always rolled. */
export type SourcesDraft = { brand?: SourceColor; neutral?: SourceColor; extras: ExtraColor[] };

/** Least ΔE_OK between a rolled colour and every other source, so no two read alike. */
const MIN_SOURCE_DISTANCE = 0.08;

/**
 * Least hue difference between an open extra and the brand or another
 * extra. Tailwind's hue families sit 10–25° apart (orange 47°, amber 70°,
 * yellow 86°), so 30° keeps at least one family between two colours.
 */
const MIN_EXTRA_HUE_DISTANCE = 30;

/** Pool colours one roll looks at: different seeds see different colours, not always the same best ones. */
const SAMPLE_SIZE = 40;

/** The roll picks at random among this many best candidates: variety without outliers. */
const TOP = 10;

/** Distinctness above this ΔE_OK counts the same, so ranking drops near-misses but does not always pick the extremes. */
const SEPARATION_CAP = 0.2;

/** Harmony turns away from the brand hue: complementary, triadic, split complementary, square. */
const HARMONY_TURNS = [180, 120, -120, 150, -150, 90, -90];

/** Stands in for a neutral that is rolled after the brand, so the brand's contrast check has a darkest step to read against. */
const PLACEHOLDER_NEUTRAL = "#737373";

/** The roles whose contrast a source decides. A candidate that makes one miss its minimum loses to any that does not. */
const ROLES_OF: Record<"brand" | "neutral", RoleName[]> = {
  brand: ["primary-foreground", "ring", "destructive"],
  // primary-foreground falls back to neutral-950, ring is read against neutral-50.
  neutral: ["foreground", "card-foreground", "muted-foreground", "primary-foreground", "ring"],
};

/**
 * Whether a colour counts as colourful (brand and extras) or grey (neutral).
 * The line is NEUTRAL_CHROMA (0.035), where the scales already switch to a
 * neutral template: one boundary for the whole generator, so a pool colour
 * rolled as brand always gets a colourful scale and the neutral a grey one.
 * A warm grey like `#8a7a72` (0.023) stays neutral, a dusty sage like
 * `#8a9a7b` (0.048) counts as colourful.
 */
const isColourful = (color: OkLch) => color.C >= NEUTRAL_CHROMA;

/** Pure white and black say nothing about a taste; they never come from the pool. */
const isWhiteOrBlack = (hex: string) => hex === "#ffffff" || hex === "#000000";

/** Seeded PRNG (mulberry32): the same seed always gives the same sequence. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a call that names none. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

type Candidate = { hex: string; origin: SourceOrigin };

/** Rolls `targets` in order (brand, neutral, extras), each against the fixed sources and those rolled before it. */
function roll(draft: SourcesDraft, targets: SourceKey[], { pool, seed, primary }: RollOptions): ColorSources {
  const random = mulberry32(seed);
  const between = (a: number, b: number) => a + random() * (b - a);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const rolled: SourceOrigin = { kind: "rolled", seed };

  const usable = pool.flatMap((color) => {
    const hex = color.hex.toLowerCase();
    return isWhiteOrBlack(hex) ? [] : [{ ...color, hex, lch: hexToOklch(hex)! }];
  });
  const colourfulPool = usable.filter((color) => isColourful(color.lch));
  const greyPool = usable.filter((color) => !isColourful(color.lch));

  const state = { brand: draft.brand, neutral: draft.neutral, extras: [...draft.extras] };
  const get = (key: SourceKey) => (typeof key === "number" ? state.extras[key] : state[key]);

  // Sources still to roll in this pass: their old colours must not hold the others in place.
  const pending = new Set(targets);
  const settled = (key: SourceKey) => !pending.has(key);

  for (const key of targets) {
    pending.delete(key);
    const current = get(key);
    const neutral = key === "neutral";
    const lockedHue = current?.lock === "hue" ? hexToOklch(current.hex)!.h : null;
    const brandLch = state.brand && hexToOklch(state.brand.hex)!;
    const others = (["brand", "neutral", ...state.extras.keys()] as SourceKey[]).flatMap((other) => {
      const source = other !== key && settled(other) ? get(other) : undefined;
      return source ? [source.hex] : [];
    });
    // Hues an open extra keeps apart from: the settled brand and other extras, where they have a hue at all.
    const hues =
      typeof key === "number" && lockedHue === null
        ? (["brand", ...state.extras.keys()] as SourceKey[]).flatMap((other) => {
            const source = other !== key && settled(other) ? get(other) : undefined;
            const lch = source && hexToOklch(source.hex)!;
            return lch && isColourful(lch) ? [lch.h] : [];
          })
        : [];

    /** A colour at the locked hue when there is one; null when it lost its kind (colourful or grey) on the way. */
    const shape = (color: OkLch): string | null => {
      const hex = oklchToHex(lockedHue === null ? color : { ...color, h: lockedHue });
      return isColourful(hexToOklch(hex)!) === !neutral ? hex : null;
    };
    const fits = (hex: string) =>
      others.every((other) => colorDistanceHex(other, hex) >= MIN_SOURCE_DISTANCE) &&
      hues.every((hue) => Math.abs(hueDiff(hexToOklch(hex)!.h, hue)) >= MIN_EXTRA_HUE_DISTANCE);

    const kindPool = neutral ? greyPool : colourfulPool;
    const fromPool = shuffle(kindPool, random)
      .slice(0, SAMPLE_SIZE)
      .flatMap(({ lch, hex, measuredBy, referenceId }): Candidate[] => {
        const shaped = shape(lch);
        if (!shaped) return [];
        const origin: SourceOrigin = shaped === hex ? { kind: "reference", referenceId, measuredBy, seed } : rolled;
        return [{ hex: shaped, origin }];
      });
    // Harmony: a single-hue pool has no colour far enough from the brand for an extra.
    const harmony = () =>
      Array.from({ length: SAMPLE_SIZE }, (): Candidate[] => {
        const { L, C } = pick(kindPool).lch;
        const h = brandLch && key !== "brand" ? brandLch.h + pick(HARMONY_TURNS) + between(-10, 10) : random() * 360;
        const hex = shape({ L, C, h });
        return hex ? [{ hex, origin: rolled }] : [];
      }).flat();
    const free = () =>
      Array.from({ length: SAMPLE_SIZE }, (): Candidate[] => {
        const hex = shape(
          neutral
            ? { L: between(0.5, 0.62), C: between(0.005, 0.03), h: brandLch && random() < 0.7 ? brandLch.h : random() * 360 }
            : { L: between(0.5, 0.7), C: between(0.12, 0.2), h: random() * 360 },
        );
        return hex ? [{ hex, origin: rolled }] : [];
      }).flat();

    let candidates = fromPool.filter(({ hex }) => fits(hex));
    if (candidates.length === 0 && !neutral && kindPool.length > 0) candidates = harmony().filter(({ hex }) => fits(hex));
    if (candidates.length === 0) {
      const freeCandidates = free();
      candidates = freeCandidates.filter(({ hex }) => fits(hex));
      // Nothing keeps its distance (five locked extras around the wheel): the roll still answers.
      if (candidates.length === 0) candidates = freeCandidates.slice(0, 1);
    }

    const chosen = pick(best(candidates, others, (hex) => keepsContrast(key, hex)));
    const next: SourceColor = { hex: chosen.hex, lock: current?.lock ?? "open", origin: chosen.origin };
    if (typeof key === "number") state.extras[key] = { ...state.extras[key]!, ...next };
    else state[key] = next;
  }

  /** Whether the roles this source decides keep their contrast with `hex` in its place. Extras decide no role. */
  function keepsContrast(key: SourceKey, hex: string) {
    if (typeof key === "number") return true;
    const roles = ROLES_OF[key];
    const sources: ColorSources = {
      brand: key === "brand" ? { hex, lock: "open", origin: rolled } : state.brand!,
      neutral: key === "neutral" ? { hex, lock: "open", origin: rolled } : (state.neutral ?? { hex: PLACEHOLDER_NEUTRAL, lock: "open", origin: rolled }),
      extras: [],
    };
    return !buildColorScheme(sources, primary).warnings.some((warning) => roles.includes(warning.role));
  }

  return { brand: state.brand!, neutral: state.neutral!, extras: state.extras };
}

/** Seeded Fisher–Yates shuffle into a new array. */
function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * The best candidates, at most TOP: one per hex, ranked by their least
 * distance to the other sources (capped at SEPARATION_CAP, ties keep the
 * sampled order), those whose roles keep their contrast first. When none
 * does, the ranking alone decides: a warning, never a dead end.
 */
function best(candidates: Candidate[], others: string[], keepsContrast: (hex: string) => boolean): Candidate[] {
  const separation = (hex: string) => Math.min(SEPARATION_CAP, ...others.map((other) => colorDistanceHex(other, hex)));
  const ranked = [...new Map(candidates.map((candidate) => [candidate.hex, candidate])).values()]
    .map((candidate) => ({ candidate, score: separation(candidate.hex) }))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);
  const passing: Candidate[] = [];
  for (const candidate of ranked) {
    if (passing.length === TOP) break;
    if (keepsContrast(candidate.hex)) passing.push(candidate);
  }
  return passing.length > 0 ? passing : ranked.slice(0, TOP);
}

/**
 * The full set of sources: given colours stay exactly as they are (also with
 * a `hue` lock), a missing brand or neutral is rolled from the pool. What
 * generate_color_scheme does with an agent's start colours.
 */
export function completeSources(draft: SourcesDraft, options: RollOptions): ColorSources {
  const targets: SourceKey[] = [...(draft.brand ? [] : ["brand" as const]), ...(draft.neutral ? [] : ["neutral" as const])];
  return roll(draft, targets, options);
}

/**
 * A new roll of the generator: every source not locked `exact` gets a new
 * colour, a `hue`-locked one keeps its hue and takes lightness and chroma
 * from the pick. With `only`, just that source rolls (a freshly added
 * extra). Same sources, pool, seed and strategy give the same result.
 */
export function rollSources(sources: ColorSources, { only, ...options }: RollOptions & { only?: SourceKey }): ColorSources {
  const keys: SourceKey[] = ["brand", "neutral", ...sources.extras.keys()];
  const targets = keys.filter((key) => {
    const source = typeof key === "number" ? sources.extras[key] : sources[key];
    return source?.lock !== "exact" && (only === undefined || only === key);
  });
  return roll(sources, targets, options);
}
