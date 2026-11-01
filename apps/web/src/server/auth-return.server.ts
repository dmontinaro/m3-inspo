import { returnPath, signInPath } from "#/lib/sign-in";

const cookieName = "INSPO_OAUTH_RETURN";

/** Preserve the safe return path even when Better Auth falls back to its global error URL. */
export async function handleAuthRequest(request: Request, handle: (request: Request) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  let startedReturn: string | undefined;
  if (request.method === "POST" && url.pathname === "/api/auth/sign-in/social") {
    try {
      const body: unknown = await request.clone().json();
      if (body && typeof body === "object" && "callbackURL" in body) startedReturn = returnPath(body.callbackURL);
    } catch { /* Better Auth still validates the original request. */ }
  }
  const response = await handle(request);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (startedReturn !== undefined && response.ok) {
    response.headers.append("set-cookie", `${cookieName}=${encodeURIComponent(startedReturn)}; Path=/api/auth; Max-Age=600; HttpOnly; SameSite=Lax${secure}`);
  }
  if (request.method === "GET" && (url.pathname.startsWith("/api/auth/callback/") || url.pathname === "/api/auth/error")) {
    const location = response.headers.get("location");
    const stored = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${cookieName}=`))?.trim().slice(cookieName.length + 1);
    let safe = "/";
    try { safe = returnPath(stored ? decodeURIComponent(stored) : undefined); } catch { /* Invalid cookie has the same safe fallback. */ }
    if (location && safe !== "/") {
      const target = new URL(location, url.origin);
      if (target.origin === url.origin && target.pathname === signInPath && !target.searchParams.has("next")) {
        target.searchParams.set("next", safe);
        response.headers.set("location", target.pathname + target.search + target.hash);
      }
    }
    response.headers.append("set-cookie", `${cookieName}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }
  return response;
}
