/**
 * The generator's state in the URL (spec #44, "URL-Zustand"): one token
 * per colour, `[name:]hex[~hue|~exact][@reference-slug]`, plus `primary`,
 * `seed` and `pool`. Every colour is in the URL as hex, open ones too, so
 * a link shows exactly its result; `seed` only drives the next rolls.
 *
 *   /generator?brand=e56236~hue@harbor-app&neutral=8a7a72&extras=teal:2f7d6d~exact&seed=42
 *
 * One parser and one serializer for the web app and MCP. Reading is
 * tolerant: a broken part is dropped or defaulted and listed in `skipped`,
 * never an error.
 */

import { normalizeHex } from "../color";
import { MAX_EXTRAS, checkExtraName, type Lock, type PrimaryStrategy } from "./scheme";

/** Where rolls draw from: all approved references, a project tag, a collection or a list of reference slugs. */
export type Pool =
  | { kind: "all" }
  | { kind: "project"; tag: string }
  | { kind: "collection"; slug: string }
  | { kind: "references"; slugs: string[] };

/** A colour as the URL carries it; `reference` is the slug of the reference it came from. */
export type GeneratorColor = { hex: string; lock: Lock; reference?: string };
export type GeneratorExtra = GeneratorColor & { name?: string };

/** A null brand or neutral was missing or unreadable: the generator rolls it. */
export type GeneratorState = {
  brand: GeneratorColor | null;
  neutral: GeneratorColor | null;
  extras: GeneratorExtra[];
  primary: PrimaryStrategy;
  seed: number | null;
  pool: Pool;
};

/** A part of the URL the parser could not use, as it stood there. */
export type SkippedPart = { param: string; value: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Reads one colour token. `damaged` when a part was dropped; null when not even the hex is readable. */
function parseColor(token: string): { color: GeneratorExtra; damaged: boolean } | null {
  let damaged = false;
  let rest = token;
  let name: string | undefined;
  let reference: string | undefined;
  let lock: Lock = "open";

  const colon = rest.indexOf(":");
  if (colon >= 0) [name, rest] = [rest.slice(0, colon), rest.slice(colon + 1)];
  const at = rest.indexOf("@");
  if (at >= 0) {
    const slug = rest.slice(at + 1);
    rest = rest.slice(0, at);
    if (SLUG.test(slug)) reference = slug;
    else damaged = true;
  }
  const tilde = rest.indexOf("~");
  if (tilde >= 0) {
    const suffix = rest.slice(tilde + 1);
    rest = rest.slice(0, tilde);
    if (suffix === "hue" || suffix === "exact") lock = suffix;
    else damaged = true;
  }
  const hex = normalizeHex(rest);
  if (!hex) return null;
  return { color: { ...(name !== undefined ? { name } : {}), hex, lock, ...(reference ? { reference } : {}) }, damaged };
}

function parsePool(value: string): Pool | null {
  if (value === "all") return { kind: "all" };
  if (value.startsWith("project:")) {
    const tag = value.slice("project:".length);
    return tag.trim() ? { kind: "project", tag } : null;
  }
  if (value.startsWith("collection:")) {
    const slug = value.slice("collection:".length);
    return SLUG.test(slug) ? { kind: "collection", slug } : null;
  }
  const slugs = value.split(",");
  return slugs.every((slug) => SLUG.test(slug)) ? { kind: "references", slugs } : null;
}

/**
 * The state from the URL's search parameters, as `URLSearchParams` entries
 * or a router's parsed search object (a seed may arrive as a number).
 * Missing parameters take their defaults silently; broken ones are listed
 * in `skipped`.
 */
export function parseGeneratorSearch(search: Record<string, unknown>): { state: GeneratorState; skipped: SkippedPart[] } {
  const skipped: SkippedPart[] = [];
  const read = (param: string) => {
    const value = search[param];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  };
  const skip = (param: string, value: string) => skipped.push({ param, value });

  const fixedColor = (param: "brand" | "neutral"): GeneratorColor | null => {
    const value = read(param);
    if (!value) return null;
    const parsed = parseColor(value);
    if (!parsed) {
      skip(param, value);
      return null;
    }
    // Only extras carry a name.
    const { name, ...color } = parsed.color;
    if (parsed.damaged || name !== undefined) skip(param, value);
    return color;
  };
  const brand = fixedColor("brand");
  const neutral = fixedColor("neutral");

  const extras: GeneratorExtra[] = [];
  for (const token of read("extras").split(",").filter(Boolean)) {
    const parsed = parseColor(token);
    if (!parsed || extras.length === MAX_EXTRAS) {
      skip("extras", token);
      continue;
    }
    const { name, ...color } = parsed.color;
    const nameOk = name === undefined || checkExtraName(name, extras.flatMap((e) => (e.name ? [e.name] : []))) === null;
    if (parsed.damaged || !nameOk) skip("extras", token);
    extras.push(nameOk && name !== undefined ? { name, ...color } : color);
  }

  const primaryValue = read("primary");
  if (primaryValue && primaryValue !== "vivid" && primaryValue !== "hold") skip("primary", primaryValue);
  const primary: PrimaryStrategy = primaryValue === "hold" ? "hold" : "vivid";

  const seedValue = read("seed");
  const seedNumber = /^\d+$/.test(seedValue) ? Number(seedValue) : NaN;
  const seed = seedNumber < 2 ** 32 ? seedNumber : null;
  if (seedValue && seed === null) skip("seed", seedValue);

  const poolValue = read("pool");
  const pool = poolValue ? parsePool(poolValue) : { kind: "all" as const };
  if (!pool) skip("pool", poolValue);

  return { state: { brand, neutral, extras, primary, seed, pool: pool ?? { kind: "all" } }, skipped };
}

const token = ({ name, hex, lock, reference }: GeneratorExtra) =>
  `${name ? `${name}:` : ""}${hex.replace("#", "")}${lock === "open" ? "" : `~${lock}`}${reference ? `@${reference}` : ""}`;

/** The `pool` param for a pool; null for all references, the default. Entry points link to the generator with it. */
export function poolValue(pool: Pool): string | null {
  if (pool.kind === "all") return null;
  if (pool.kind === "project") return `project:${pool.tag}`;
  if (pool.kind === "collection") return `collection:${pool.slug}`;
  return pool.slugs.join(",");
}

/** Encoded like a query value, but `:`, `@` and `,` stay readable; they are legal in a query. */
const encode = (value: string) =>
  encodeURIComponent(value).replace(/%3A/g, ":").replace(/%40/g, "@").replace(/%2C/g, ",");

/** The search part of a generator URL, without `?`. Defaults (vivid, no seed, pool all) stay out. */
export function serializeGeneratorSearch(state: GeneratorState): string {
  const params: [string, string | null][] = [
    ["brand", state.brand && token(state.brand)],
    ["neutral", state.neutral && token(state.neutral)],
    ["extras", state.extras.length ? state.extras.map(token).join(",") : null],
    ["primary", state.primary === "vivid" ? null : state.primary],
    ["seed", state.seed === null ? null : String(state.seed)],
    ["pool", poolValue(state.pool)],
  ];
  return params.flatMap(([key, value]) => (value === null ? [] : [`${key}=${encode(value)}`])).join("&");
}
