/**
 * How the router reads and writes search params (router.tsx). Like
 * TanStack's default, values the router writes as JSON (numbers, booleans,
 * objects) come back typed and every string comes back as written. Two
 * differences:
 *
 * - A value only counts as JSON when it reads back identically. The default
 *   turns `12e456`, a valid hex colour in a generator link, into Infinity.
 * - `:`, `@` and `,` stay unencoded, so generator links stay readable:
 *   `/generator?brand=e56236~hue@harbor-app&extras=teal:2f7d6d`.
 */

import { parseSearchWith } from "@tanstack/react-router";

/** JSON only when lossless; anything else stays the string it was. */
function parseValue(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return JSON.stringify(parsed) === value ? parsed : value;
  } catch {
    return value;
  }
}

export const parseSearch: (searchStr: string) => Record<string, unknown> = parseSearchWith(parseValue);

/** Encoded for a query, but with `:`, `@` and `,` left readable; they are legal there. */
const encode = (value: string) =>
  encodeURIComponent(value).replace(/%3A/g, ":").replace(/%40/g, "@").replace(/%2C/g, ",");

/**
 * A string that would read back as something else (`"42"` as 42) is written
 * as JSON. parseValue decides that alone: the router's own number and
 * boolean step only takes values JSON would turn into the same.
 */
function stringifyValue(value: unknown): string {
  if (typeof value === "string") return parseValue(value) === value ? value : JSON.stringify(value);
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

export function stringifySearch(search: Record<string, unknown>): string {
  const pairs = Object.entries(search).flatMap(([key, value]) =>
    value === undefined ? [] : [`${encode(key)}=${encode(stringifyValue(value))}`],
  );
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
