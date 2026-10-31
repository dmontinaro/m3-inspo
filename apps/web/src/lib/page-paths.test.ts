import { describe, expect, it } from "vitest";
import { canonicalPagePath, pageRedirect, pairingDetailPath } from "./page-paths";
import { returnPath, signInUrl } from "./sign-in";

const aliases = [
  ["/referenzen/hotel", "/references/hotel"],
  ["/sammlungen", "/collections"], ["/sammlungen/sommer", "/collections/sommer"],
  ["/schriften", "/type-pairings"], ["/schriften/neu", "/type-pairings/new"],
  ["/schriften/new", "/type-pairings/new/view"], ["/schriften/hotel", "/type-pairings/hotel"],
  ["/schriften/new/bearbeiten", "/type-pairings/new/edit"], ["/schriften/hotel/bearbeiten", "/type-pairings/hotel/edit"],
  ["/hochladen", "/add"], ["/importe", "/imports"], ["/einstellungen", "/settings"],
  ["/werkzeuge", "/tools"], ["/anmelden", "/sign-in"],
] as const;
const query = "?x=a%2Bb&x=a+b&empty=&q=%252F&unknown=1";

describe("page migration at the HTTP boundary", () => {
  it.each(aliases)("redirects %s once, with raw query, for GET and HEAD", async (old, target) => {
    for (const method of ["GET", "HEAD"]) for (const suffix of ["", "/"]) for (const locale of ["en", "de"]) {
      const result = pageRedirect(new Request(`https://inspo.example${old}${suffix}${query}`, { method, headers: { cookie: `PARAGLIDE_LOCALE=${locale}` } }));
      expect(result?.status).toBe(308);
      expect(result?.headers.get("location")).toBe(target + query);
      expect(result?.headers.get("set-cookie")).toBeNull();
      expect(await result?.text()).toBe("");
      expect(pageRedirect(new Request(`https://inspo.example${target}${query}`, { method }))).toBeUndefined();
    }
  });

  it.each(["/", "/generator", "/brand-kits", "/brand-kits/hotel", "/references/hotel", "/collections", "/type-pairings/new/view"])("keeps canonical %s", (path) => {
    expect(pageRedirect(new Request(`https://inspo.example${path}`))).toBeUndefined();
    if (path !== "/") expect(canonicalPagePath(`${path}/`)).toBe(path);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("does not migrate %s", (method) => {
    expect(pageRedirect(new Request("https://inspo.example/referenzen/hotel", { method }))).toBeUndefined();
  });

  it.each(["/api/auth/callback/github", "/api/mcp", "/api/worker/objects/referenzen/x", "/api/assets/referenzen/x", "/_serverFn/function", "/favicon.svg", "/referenzen/x/extra", "/referenzen//x", "/referenzen/x//", "/referenzen/x%2Fy", "/referenzen/x%5Cy", "/referenzen/x%252Fy", "/referenzen/x%", "/referenzen/../x", "/referenzen/%2e%2e", "/referenzen/x\\y", "/referenzen/x%00"])("does not guess an alias for %s", (path) => {
    expect(canonicalPagePath(path)).toBeNull();
  });

  it("decodes individual segments once without changing slug meanings", () => {
    expect(canonicalPagePath("/REFERENZEN/zimmer%75ebersicht/")).toBe("/references/zimmeruebersicht");
    expect(canonicalPagePath("/schriften/%6eew")).toBe("/type-pairings/new/view");
    for (const slug of ["new", "edit", "view", "bearbeiten", "neu-123abc", "muehle"]) {
      expect(canonicalPagePath(`/schriften/${slug}/bearbeiten`)).toBe(`/type-pairings/${slug}/edit`);
      expect(pairingDetailPath(slug)).toBe(slug === "new" ? "/type-pairings/new/view" : `/type-pairings/${slug}`);
    }
  });
});

describe("shared safe OAuth return paths", () => {
  it("canonicalizes only the outer page, preserving nested query and hash", () => {
    const path = "/sammlungen/sommer?x=a%2Bb&x=a+b&next=%2Fapi%2Fauth%2Fsign-out#section";
    const expected = path.replace("sammlungen", "collections");
    expect(returnPath(path)).toBe(expected);
    expect(new URL(signInUrl(path), "https://inspo.example").searchParams.get("next")).toBe(expected);
    expect(returnPath("/schriften/new?x=1#section")).toBe("/type-pairings/new/view?x=1#section");
  });

  it.each(["https://inspo.example/generator", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/generator\n", "/generator/../settings", "/%2e%2e/settings", "/references/x%2fy", "/references/x%252fy", "/generator?q=%", "/SIGN-IN/", "/%61nmelden", "/unknown", "/api/auth/sign-out", "/api/assets/x", "/_serverFn/x", ["/generator", "/settings"], {}, 1])("rejects %j", (path) => {
    expect(returnPath(path)).toBe("/");
    expect(signInUrl(path)).toBe("/sign-in");
  });
});
