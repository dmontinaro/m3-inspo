/**
 * The owner's tags, e.g. projects ("sample-project") or topics ("hotel"). Shared
 * by the tag input (early cleanup while typing) and the server (the real
 * check). Stored normalized in `references.tags`.
 */

export const maxTags = 20;
export const maxTagLength = 40;

/** Everything a tag may not contain: allowed are letters, digits, space, - and _. */
export const disallowedTagCharacters = /[^\p{L}\p{N} _-]/gu;

/** " Hai  Suite " → "hai suite" */
export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
