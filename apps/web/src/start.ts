import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { signInPath, signInUrl } from "./lib/sign-in";
import { maxUploadBytes } from "./lib/upload-limits";
import { isMcpPath } from "./lib/mcp-tokens";
import { findOwner } from "./server/owner.server";
import { isWorkerPath } from "./server/worker-auth.server";

/** Paths anyone may reach: the sign-in page and Better Auth's own endpoints. */
function isPublicPath(pathname: string): boolean {
  return pathname === signInPath || pathname.startsWith("/api/auth/");
}

/**
 * Deny by default: every request that is not public must come from the owner.
 * Page loads without the owner go to sign-in, which leads back to the page
 * afterwards; server functions and API routes get 401. Server-only: Start
 * strips `.server()` (and its imports) from the client.
 *
 * The MCP endpoint and the worker API are the exceptions: every path the
 * router matches to them skips the session check, because their handlers
 * (routes/api/mcp.ts, routes/api/worker/$.ts) accept a token header (or a
 * signed upload URL) only and ignore the session cookie.
 */
const ownerGate = createMiddleware().server(async ({ request, pathname, handlerType, next }) => {
  if (isMcpPath(pathname) || isWorkerPath(pathname) || isPublicPath(pathname) || (await findOwner(request.headers))) {
    return next();
  }

  const isPageLoad = handlerType === "router" && request.method === "GET" && !pathname.startsWith("/api/");
  if (isPageLoad) {
    const page = new URL(request.url);
    return new Response(null, { status: 307, headers: { location: signInUrl(page.pathname + page.search) } });
  }
  return new Response("Unauthorized", { status: 401 });
});

/** The largest request body we accept: one upload plus room for the multipart envelope and form fields. */
const maxRequestBytes = maxUploadBytes + 1024 * 1024;

/**
 * Turns away requests that announce a body over `maxRequestBytes` before
 * anything reads it; server functions parse FormData before their own code
 * runs. Bodies without a Content-Length are still checked after parsing
 * (library.server.ts).
 */
const bodySizeLimit = createMiddleware().server(async ({ request, next }) => {
  if (Number(request.headers.get("content-length")) > maxRequestBytes) {
    return new Response("Payload Too Large", { status: 413 });
  }
  return next();
});

/** Tells crawlers to skip every response, on top of the robots meta tag. */
const noIndex = createMiddleware().server(async ({ next }) => {
  const result = await next();
  result.response.headers.set("x-robots-tag", "noindex, nofollow");
  return result;
});

// Global request middleware runs before every page, server route and server
// function. A custom start.ts turns off Start's built-in CSRF check for
// server functions, so it is added back before the owner gate. It covers
// server functions only; /api/mcp and /api/worker are safe without it, as they
// ignore cookies (see their routes).
export const startInstance = createStart(() => ({
  requestMiddleware: [
    noIndex,
    bodySizeLimit,
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
    ownerGate,
  ],
}));
