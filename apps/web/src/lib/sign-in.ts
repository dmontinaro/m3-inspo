/* eslint-disable no-control-regex -- Reject control bytes in untrusted return URLs. */
import { canonicalPagePath } from "./page-paths";

export const signInPath = "/sign-in";
export const notOwnerError = "not_owner";
const ownOrigin = "http://inspo.invalid";

/** Only a single, unambiguous known internal page may be an OAuth return path. */
export function returnPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(next)) return "/";
  try {
    // Validate before URL normalizes dot segments. Query/hash encoding must also be valid.
    decodeURIComponent(next);
    const pathname = next.split(/[?#]/, 1)[0] ?? "";
    const page = canonicalPagePath(pathname);
    const url = new URL(next, ownOrigin);
    if (!page || page === signInPath || url.origin !== ownOrigin) return "/";
    return page + url.search + url.hash;
  } catch { return "/"; }
}

export function signInUrl(page: unknown): string {
  const safe = returnPath(page);
  return safe === "/" ? signInPath : `${signInPath}?${new URLSearchParams({ next: safe })}`;
}
