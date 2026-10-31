/** Known page paths only. API, asset and server-function paths never match. */
// Control bytes are rejected at the URL boundary.
/* eslint-disable no-control-regex */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const staticPages = new Map([
  ["anmelden", "sign-in"], ["sign-in", "sign-in"],
  ["hochladen", "add"], ["add", "add"],
  ["importe", "imports"], ["imports", "imports"],
  ["einstellungen", "settings"], ["settings", "settings"],
  ["werkzeuge", "tools"], ["tools", "tools"],
  ["generator", "generator"], ["brand-kits", "brand-kits"],
  ["sammlungen", "collections"], ["collections", "collections"],
  ["schriften", "type-pairings"], ["type-pairings", "type-pairings"],
]);

/** Returns a canonical known page, or null for malformed and unknown paths. */
export function canonicalPagePath(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (!pathname.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(pathname)) return null;
  let parts: string[];
  try { parts = pathname.replace(/\/$/, "").slice(1).split("/").map((part) => decodeURIComponent(part)); }
  catch { return null; }
  if (parts.some((part) => !part || /[%/\\\u0000-\u0020\u007f]/.test(part) || part === "." || part === "..")) return null;
  const [first = "", slug, action] = parts;
  const root = first.toLowerCase();
  if (parts.length === 1) {
    const page = staticPages.get(root);
    return page ? `/${page}` : null;
  }
  // Creation and the fixed `new/view` exception contain static segments, like the first segment.
  if (parts.length === 2 && ((root === "schriften" && slug.toLowerCase() === "neu") || (root === "type-pairings" && slug.toLowerCase() === "new"))) return "/type-pairings/new";
  if (parts.length === 3 && root === "type-pairings" && slug.toLowerCase() === "new" && action.toLowerCase() === "view") return "/type-pairings/new/view";
  if (!slug || !slugPattern.test(slug)) return null;
  if (root === "schriften" || root === "type-pairings") {
    if (parts.length === 2) {
      return slug === "new" ? (root === "schriften" ? "/type-pairings/new/view" : "/type-pairings/new") : `/type-pairings/${slug}`;
    }
    if (parts.length === 3 && (action.toLowerCase() === (root === "schriften" ? "bearbeiten" : "edit"))) return `/type-pairings/${slug}/edit`;
    return null;
  }
  if (parts.length !== 2) return null;
  if (root === "referenzen" || root === "references") return `/references/${slug}`;
  if (root === "sammlungen" || root === "collections") return `/collections/${slug}`;
  if (root === "brand-kits") return `/brand-kits/${slug}`;
  return null;
}

export function pairingDetailPath(slug: string): string {
  return slug === "new" ? "/type-pairings/new/view" : `/type-pairings/${slug}`;
}

/** A page migration never parses or serializes query contents. */
export function pageRedirect(request: Request): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const url = new URL(request.url);
  const page = canonicalPagePath(url.pathname);
  if (!page || page === url.pathname) return;
  return new Response(null, { status: 308, headers: { location: page + url.search, "x-robots-tag": "noindex, nofollow" } });
}
