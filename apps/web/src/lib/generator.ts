import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
/**
 * The generator's state (spec #44, "Generator in der Web-App" and
 * "URL-Zustand"): a draft of source colours, `primary` strategy and seed,
 * the steps that change it, the undo history over them, and the way to and
 * from the URL. Pure; the generator page holds the history in React state
 * and writes every step to the URL.
 *
 * ```ts
 * const { draft, pool, skipped } = draftFromSearch(Route.useSearch(), poolData);
 * let history = startHistory(draft);
 * history = record(history, rollDraft(history.present, poolData.colors, randomSeed()));
 * history = record(history, adjustColor(history.present, "brand", "#d54400"), gesture); // one drag, one step
 * const search = serializeGeneratorSearch(searchFromDraft(history.present, pool, poolData.linked.references));
 * ```
 */

import { hexToOklch, normalizeHex } from "@m3-inspo/shared";
import {
  MAX_EXTRAS,
  NEUTRAL_CHROMA,
  completeSources,
  parseGeneratorSearch,
  rollSources,
  serializeGeneratorSearch,
  suggestExtraName,
} from "@m3-inspo/shared/color-scheme";
import type {
  ColorScheme,
  ColorSources,
  ExtraColor,
  GeneratorColor,
  GeneratorExtra,
  GeneratorState,
  Lock,
  Pool,
  PoolColor,
  PrimaryStrategy,
  RollOptions,
  SkippedPart,
  SourceColor,
  SourceKey,
  SourceOrigin,
} from "@m3-inspo/shared/color-scheme";

/**
 * A reference as the generator shows it: in the pool strip, or named as a
 * colour's origin. Only a kit's source reference may lack a thumbnail.
 */
export type GeneratorReference = { id: string; slug: string; title: string; thumbUrl: string | null };

/** A reference in the pool, with the original image the picker's pipette shows and reads (`readImagePixel`). */
export type PoolReference = GeneratorReference & { imageUrl: string };

/**
 * What the generator needs from the library: the pool's references and
 * colours, the references the URL names with their measured colours (in the
 * pool or not), and what the pool menu offers.
 */
export type PoolData = {
  references: PoolReference[];
  colors: PoolColor[];
  linked: { references: GeneratorReference[]; colors: PoolColor[] };
  collections: { slug: string; name: string }[];
  projects: string[];
};

/** One step of the generator: what undo goes back to. `seed` is the one the latest roll used. */
export type Draft = { sources: ColorSources; primary: PrimaryStrategy; seed: number };

/**
 * A part of a generator link the generator could not use as it stood, and
 * why: a colour it could not read (and rolled), one it read only in part,
 * a sixth extra, a reference or pool entry the library does not know.
 */
export type SkippedNotice = SkippedPart & { reason: "unreadable" | "damaged" | "too-many" | "unknown-reference" | "unknown-pool" };

/* ────────────── URL ────────────── */

/** Whether a colour token reads as a colour at all, on its own. */
function readsAsColor(param: string, token: string): boolean {
  const { state } = parseGeneratorSearch({ [param]: token });
  return param === "extras" ? state.extras.length > 0 : Boolean(state.brand ?? state.neutral);
}

/** The `extras` tokens as the shared parser reads them. */
const extraTokens = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value).split(",").filter(Boolean) : [];

/**
 * The draft and pool a generator URL describes (its search params as the
 * router parsed them), with every part it had to skip. Given colours stay
 * as they are; a missing or unreadable brand or neutral is rolled from the
 * pool with the URL's seed, an unreadable extra too, in its place. Origins
 * as the spec reads them: with a known `@slug` from that reference
 * (measured as its palette says, else by pipette), else exact ones by hand
 * and every other one rolled. An unknown reference only loses the link; the
 * colour keeps its value.
 */
export function draftFromSearch(search: Record<string, unknown>, data: PoolData): { draft: Draft; pool: Pool; skipped: SkippedNotice[] } {
  const { state, skipped } = parseGeneratorSearch(search);
  const seed = state.seed ?? 0;
  const options: RollOptions = { pool: data.colors, seed, primary: state.primary };
  const { linked } = data;

  // The extras in token order, null where a token was unreadable and is rolled, while
  // the readable ones still keep their place among the five.
  const slots: (GeneratorExtra | null)[] = [];
  const tooMany = new Set<string>();
  let kept = 0;
  for (const token of extraTokens(search.extras)) {
    const readable = readsAsColor("extras", token);
    if (readable && kept < state.extras.length) slots.push(state.extras[kept++]);
    else if (!readable && slots.length + state.extras.length - kept < MAX_EXTRAS) slots.push(null);
    else tooMany.add(token);
  }

  const notices: SkippedNotice[] = skipped.map((part) => {
    if (tooMany.has(part.value) && part.param === "extras") return { ...part, reason: "too-many" };
    if (part.param !== "brand" && part.param !== "neutral" && part.param !== "extras") return { ...part, reason: "unreadable" };
    return { ...part, reason: readsAsColor(part.param, part.value) ? "damaged" : "unreadable" };
  });

  const source = (param: string, { hex, lock, reference }: GeneratorColor): SourceColor => {
    const known = reference ? linked.references.find((candidate) => candidate.slug === reference) : undefined;
    if (reference && !known) notices.push({ param, value: reference, reason: "unknown-reference" });
    let origin: SourceOrigin = lock === "exact" ? { kind: "manual" } : { kind: "rolled", seed };
    if (known) {
      const measured = linked.colors.find((color) => color.referenceId === known.id && color.hex === hex);
      origin = { kind: "reference", referenceId: known.id, measuredBy: measured?.measuredBy ?? "image" };
    }
    return { hex, lock, origin };
  };

  const brand = state.brand && source("brand", state.brand);
  const neutral = state.neutral && source("neutral", state.neutral);
  // Given names first, so a suggestion never takes one a later extra carries.
  const taken = state.extras.flatMap((extra) => (extra.name ? [extra.name] : []));
  const named = (extra: ExtraColor): ExtraColor => {
    const name = extra.name || suggestExtraName(extra.hex, taken);
    if (!extra.name) taken.push(name);
    return { ...extra, name };
  };
  const given = slots.flatMap((slot) => (slot ? [named({ ...source("extras", slot), name: slot.name ?? "" })] : []));

  let sources = completeSources({ ...(brand ? { brand } : {}), ...(neutral ? { neutral } : {}), extras: given }, options);
  // Unreadable extras go back in their places and roll one by one, like a newly added extra.
  let next = 0;
  const placeholder: ExtraColor = { ...sources.brand, lock: "open", name: "" };
  sources = { ...sources, extras: slots.map((slot) => (slot ? sources.extras[next++] : placeholder)) };
  for (const [index, slot] of slots.entries()) {
    if (slot) continue;
    const rolled = rollSources(sources, { ...options, only: index });
    sources = { ...rolled, extras: rolled.extras.map((extra, i) => (i === index ? named(extra) : extra)) };
  }

  notices.push(...unknownPoolParts(state.pool, data));
  return { draft: { sources, primary: state.primary, seed }, pool: state.pool, skipped: notices };
}

/** Pool entries the library does not know: a collection, or slugs that are no approved reference. */
function unknownPoolParts(pool: Pool, data: PoolData): SkippedNotice[] {
  const unknown = (value: string): SkippedNotice => ({ param: "pool", value, reason: "unknown-pool" });
  if (pool.kind === "collection" && !data.collections.some((collection) => collection.slug === pool.slug))
    return [unknown(`collection:${pool.slug}`)];
  if (pool.kind === "references")
    return pool.slugs.filter((slug) => !data.references.some((reference) => reference.slug === slug)).map(unknown);
  return [];
}

/** The slugs of the references a link's colours name (`@slug`), for loading them with the pool. */
export const linkedSlugs = (state: GeneratorState) =>
  [state.brand, state.neutral, ...state.extras].flatMap((color) => (color?.reference ? [color.reference] : []));

/**
 * A reference's whole palette as the generator's start ("Als Color Scheme
 * übernehmen"): every colour locked exactly and linked to the reference,
 * the reference itself as the pool. The first colourful colour in palette
 * order becomes the brand, the greyest grey the neutral, the rest extras
 * in palette order, up to five. Pure white and black are left out, as in
 * rolls; a brand or neutral the palette lacks is rolled when the link opens.
 *
 *   <Link to="/generator" search={paletteSearch(["#1d4a66", "#e8f1f7"], "skimap")} />
 */
export function paletteSearch(palette: readonly string[], slug: string): Record<string, string> {
  const colors = [...new Set(palette.flatMap((value) => normalizeHex(value) ?? []))]
    .filter((hex) => hex !== "#ffffff" && hex !== "#000000")
    .map((hex) => ({ hex, chroma: hexToOklch(hex)!.C }));
  const brand = colors.find((color) => color.chroma >= NEUTRAL_CHROMA);
  const neutral = colors.filter((color) => color.chroma < NEUTRAL_CHROMA).sort((a, b) => a.chroma - b.chroma).at(0);
  const exact = (hex: string): GeneratorColor => ({ hex, lock: "exact", reference: slug });
  const state: GeneratorState = {
    brand: brand ? exact(brand.hex) : null,
    neutral: neutral ? exact(neutral.hex) : null,
    extras: colors.filter((color) => color !== brand && color !== neutral).slice(0, MAX_EXTRAS).map((color) => exact(color.hex)),
    primary: "vivid",
    seed: null,
    pool: { kind: "references", slugs: [slug] },
  };
  return Object.fromEntries(new URLSearchParams(serializeGeneratorSearch(state)));
}

/** The URL state of a draft; a colour from a reference the generator knows carries its slug. */
export function searchFromDraft(draft: Draft, pool: Pool, references: readonly GeneratorReference[]): GeneratorState {
  const color = ({ hex, lock, origin }: SourceColor): GeneratorColor => {
    const slug = origin.kind === "reference" ? references.find((reference) => reference.id === origin.referenceId)?.slug : undefined;
    return { hex, lock, ...(slug ? { reference: slug } : {}) };
  };
  return {
    brand: color(draft.sources.brand),
    neutral: color(draft.sources.neutral),
    extras: draft.sources.extras.map((extra) => ({ name: extra.name, ...color(extra) })),
    primary: draft.primary,
    seed: draft.seed,
    pool,
  };
}

const paramLabels: Record<string, string> = { get brand() { return m.source_brand(); }, get neutral() { return m.source_neutral(); }, get extras() { return m.source_extra(); }, get primary() { return "primary"; }, get seed() { return m.generator_seed(); }, get pool() { return m.generator_pool(); } };

/** One line per skipped part, for the short message a broken link opens with. */
export function describeSkipped({ param, value, reason }: SkippedNotice): string {
  const part = m.generator_part_label({ label: paramLabels[param] ?? param, value });
  switch (reason) {
    case "unknown-reference":
      return m.generator_unknown_reference({ slug: value });
    case "unknown-pool":
      return m.generator_unknown_pool({ value });
    case "too-many":
      return m.generator_extra_limit({ part, max: formatNumber(MAX_EXTRAS) });
    case "damaged":
      return m.generator_part_partial({ part });
    case "unreadable":
      return param === "brand" || param === "neutral" || param === "extras" ? m.generator_part_rolled({ part }) : m.generator_part_invalid({ part });
  }
}

/* ────────────── Saved kits ────────────── */

/**
 * Whether a link carries colours of its own, or (on a kit's page) only pool,
 * seed or a strategy: without colours a kit's page shows the saved state.
 */
export const hasSchemeParams = (search: Record<string, unknown>) =>
  ["brand", "neutral", "extras"].some((param) => {
    const value = search[param];
    return (typeof value === "string" && value !== "") || typeof value === "number";
  });

/** The search part (without `?`) of a link naming only a pool, e.g. a kit's page rolling on from `project:harbor`. */
export const poolSearch = (pool: Pool) =>
  serializeGeneratorSearch({ brand: null, neutral: null, extras: [], primary: "vivid", seed: null, pool });

/** A saved Color Scheme as a generator draft, to work on or to go back to. */
export const draftFromScheme = ({ sources, primary }: Pick<ColorScheme, "sources" | "primary">): Draft => ({ sources, primary, seed: 0 });

/** What of a draft a link shows: per colour hex, lock, name and the reference it comes from, plus `primary`. */
const shown = ({ sources, primary }: Draft) =>
  JSON.stringify([
    primary,
    ...[sources.brand, sources.neutral, ...sources.extras].map((color) => [
      color.hex,
      color.lock,
      "name" in color ? color.name : null,
      color.origin.kind === "reference" ? color.origin.referenceId : null,
    ]),
  ]);

/**
 * Whether two drafts hold the same Color Scheme as far as a link shows it.
 * Seeds and the finer points of an origin (rolled or by hand) do not count,
 * since a link does not keep them: a kit reopened from its URL is still unchanged.
 */
export const isSameScheme = (a: Draft, b: Draft) => shown(a) === shown(b);

/* ────────────── Steps ────────────── */

export function getSource(sources: ColorSources, key: SourceKey): SourceColor {
  return typeof key === "number" ? sources.extras[key] : sources[key];
}

/**
 * An extra after its colour may have changed: a name that is still the
 * suggestion for its old colour (next to the other names `takenBefore`)
 * follows the new one, free among `takenNow` ("green" becomes "teal"); a
 * name given by hand stays.
 */
function followName(before: ExtraColor, after: ExtraColor, takenBefore: string[], takenNow = takenBefore): ExtraColor {
  if (after.hex === before.hex || before.name !== suggestExtraName(before.hex, takenBefore)) return after;
  return { ...after, name: suggestExtraName(after.hex, takenNow) };
}

/** The names of all extras but the one at `index`. */
const otherNames = (extras: readonly ExtraColor[], index: number) => extras.flatMap((extra, i) => (i === index ? [] : [extra.name]));

function withSource(draft: Draft, key: SourceKey, change: (source: SourceColor) => SourceColor): Draft {
  const { sources } = draft;
  if (typeof key !== "number") return { ...draft, sources: { ...sources, [key]: change(sources[key]) } };
  const extras = sources.extras.map((extra, index) => (index === key ? followName(extra, { ...extra, ...change(extra) }, otherNames(sources.extras, index)) : extra));
  return { ...draft, sources: { ...sources, extras } };
}

const nextLock: Record<Lock, Lock> = { open: "hue", hue: "exact", exact: "open" };

/** Click on the lock: open → hue → exact → open. */
export const cycleLock = (draft: Draft, key: SourceKey) => withSource(draft, key, (source) => ({ ...source, lock: nextLock[source.lock] }));

export const setLock = (draft: Draft, key: SourceKey, lock: Lock) => withSource(draft, key, (source) => ({ ...source, lock }));

/** A colour set by hand (picker, hex field) is locked exactly, so the next roll keeps it. */
export const adjustColor = (draft: Draft, key: SourceKey, hex: string) =>
  withSource(draft, key, () => ({ hex, lock: "exact", origin: { kind: "manual" } }));

/**
 * A colour taken from a reference in the picker ("Aus Referenz"): from its
 * measured palette or by pipette from its image. Locked exactly like any
 * colour chosen by hand. Measured as the reference's palette says, else by
 * pipette (`image`), the way a link reads its `@slug`. Taking the colour a
 * source already is from there changes nothing: the same draft comes back.
 */
export function takeFromReference(draft: Draft, key: SourceKey, hex: string, referenceId: string, colors: readonly PoolColor[]): Draft {
  const measuredBy = colors.find((color) => color.referenceId === referenceId && color.hex === hex)?.measuredBy ?? "image";
  const { hex: currentHex, lock, origin } = getSource(draft.sources, key);
  const unchanged =
    currentHex === hex &&
    lock === "exact" &&
    origin.kind === "reference" &&
    origin.referenceId === referenceId &&
    origin.measuredBy === measuredBy;
  if (unchanged) return draft;
  return withSource(draft, key, () => ({ hex, lock: "exact", origin: { kind: "reference", referenceId, measuredBy } }));
}

/** Puts a source back as it was, e.g. "Wie vorher" in the picker. */
export const replaceSource = (draft: Draft, key: SourceKey, source: SourceColor) => withSource(draft, key, () => source);

/** The name is checked by the caller (checkExtraName). */
export function renameExtra(draft: Draft, index: number, name: string): Draft {
  const extras = draft.sources.extras.map((extra, i) => (i === index ? { ...extra, name } : extra));
  return { ...draft, sources: { ...draft.sources, extras } };
}

/** Space bar: every colour not locked exactly gets a new one; suggested names follow their extras. */
export function rollDraft(draft: Draft, pool: readonly PoolColor[], seed: number): Draft {
  const rolled = rollSources(draft.sources, { pool, seed, primary: draft.primary });
  // One by one, so two extras never move to the same name.
  const extras = [...draft.sources.extras];
  for (const [index, extra] of rolled.extras.entries()) {
    extras[index] = followName(draft.sources.extras[index], extra, otherNames(draft.sources.extras, index), otherNames(extras, index));
  }
  return { ...draft, seed, sources: { ...rolled, extras } };
}

/** A new extra colour, rolled on its own (the others stay put) and named after the nearest Tailwind colour. At most five. */
export function addExtra(draft: Draft, pool: readonly PoolColor[], seed: number): Draft {
  const { extras } = draft.sources;
  if (extras.length >= MAX_EXTRAS) return draft;
  const placeholder: ExtraColor = { ...draft.sources.brand, lock: "open", name: "" };
  const rolled = rollSources({ ...draft.sources, extras: [...extras, placeholder] }, { pool, seed, primary: draft.primary, only: extras.length });
  const added = rolled.extras.at(-1)!;
  const name = suggestExtraName(added.hex, extras.map((extra) => extra.name));
  return { ...draft, seed, sources: { ...rolled, extras: [...extras, { ...added, name }] } };
}

export function removeExtra(draft: Draft, index: number): Draft {
  return { ...draft, sources: { ...draft.sources, extras: draft.sources.extras.filter((_, i) => i !== index) } };
}

/**
 * A dragged extra goes to place `to`; the ones in between move up by one.
 * Marke and Neutral keep their places. A move to where it already is, or
 * outside the extras, returns the same draft, so it adds no undo step.
 */
export function moveExtra(draft: Draft, from: number, to: number): Draft {
  const extras = [...draft.sources.extras];
  if (from === to || [from, to].some((place) => place < 0 || place >= extras.length)) return draft;
  extras.splice(to, 0, ...extras.splice(from, 1));
  return { ...draft, sources: { ...draft.sources, extras } };
}

/* ────────────── Undo ────────────── */

/**
 * The drafts before the present one. `gesture` tags the present step: a
 * further step with the same gesture (the next change of one slider drag)
 * replaces it instead of adding one. Lives in memory only.
 */
export type History = { past: Draft[]; present: Draft; gesture: number | null };

/** Undo reaches this far back. */
const MAX_UNDO = 200;

export const startHistory = (draft: Draft): History => ({ past: [], present: draft, gesture: null });

/** A step that returns the present draft itself (nothing changed) leaves the history as it is. */
export function record(history: History, next: Draft, gesture?: number): History {
  if (next === history.present) return history;
  if (gesture !== undefined && gesture === history.gesture) return { ...history, present: next };
  return { past: [...history.past, history.present].slice(-MAX_UNDO), present: next, gesture: gesture ?? null };
}

/** `Z`: back one step; at the start nothing happens. */
export function undo(history: History): History {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, gesture: null } : history;
}
