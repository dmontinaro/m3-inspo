/**
 * The sign-in page. Pages that need a session send you here with
 * `?next=<path+query>` (see `signInUrl`); failed sign-ins land here with
 * `?error=<code>`.
 */
export const signInPath = "/anmelden";

/** Error code Better Auth reports when a GitHub account is not the owner's. */
export const notOwnerError = "not_owner";

/** The sign-in URL that leads back to `page` (path and query) afterwards. The start page needs no `next`. */
export const signInUrl = (page: string) =>
  page === "/" ? signInPath : `${signInPath}?${new URLSearchParams({ next: page })}`;

// Resolving against a made-up origin shows whether `next` stays on our site.
const ownOrigin = "http://inspo.invalid";

/**
 * Where to go after signing in: `next` if it is a path on this site, else the
 * start page. Absolute URLs, `//host`, `/\host` and other schemes such as
 * `javascript:` never get through, so `next` cannot become an open redirect.
 */
export function returnPath(next: string | undefined): string {
  if (!next?.startsWith("/")) return "/";
  const url = new URL(next, ownOrigin);
  return url.origin === ownOrigin ? url.pathname + url.search + url.hash : "/";
}
