import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { account, user } from "@m3-inspo/db/auth-schema";
import { getDb } from "@m3-inspo/db/client";
import { callServerFunction, startTestApp, testOrigin } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { GithubAccount } from "./test/fake-github";

const owner: GithubAccount = { id: 1001, login: "owner", name: "Alex", email: "owner@example.com" };
const stranger: GithubAccount = { id: 2002, login: "stranger", name: "Stranger", email: "stranger@example.com" };
const formerMember: GithubAccount = { id: 3003, login: "former", name: "Former", email: "former@example.com" };
const impostor: GithubAccount = { id: 4004, login: "impostor", name: "Impostor", email: owner.email };

const crossSite = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const serverFunctionHeaders = { "x-tsr-serverFn": "true" };

let app: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  useFakeGithub([owner, stranger, formerMember, impostor]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const getOwnerUrl = () => app.serverFunctionUrl("/src/server/owner.functions.ts", "getOwner");

describe("without a session", () => {
  it("sends the start page to sign-in", async () => {
    const response = await app.browser().get("/");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/sign-in");
  });

  it("sends any other page to sign-in with the page as `next`", async () => {
    const page = "/generator?brand=e56236~exact&primary=vivid";

    const response = await app.browser().get(page);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "", testOrigin);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe(page);
  });

  it("rejects the start page's server function", async () => {
    const response = await app.browser().get(await getOwnerUrl(), serverFunctionHeaders);

    expect(response.status).toBe(401);
  });

  it("rejects every API path outside /api/auth, known or not", async () => {
    const response = await app.browser().get("/api/anything");

    expect(response.status).toBe(401);
  });

  it("marks responses as noindex", async () => {
    const browser = app.browser();

    expect((await browser.get("/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await browser.get("/sign-in")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("cross-site requests", () => {
  it("cannot call a server function with the owner's session", async () => {
    const browser = app.browser();
    await signInWithGithub(browser, owner);

    expect((await browser.get(await getOwnerUrl(), serverFunctionHeaders)).status).toBe(200);
    expect((await browser.get(await getOwnerUrl(), { ...serverFunctionHeaders, ...crossSite })).status).toBe(403);
  });

  it("cannot sign the owner out", async () => {
    const browser = app.browser();
    await signInWithGithub(browser, owner);

    expect((await browser.post("/api/auth/sign-out", undefined, crossSite)).status).toBe(403);
    expect((await browser.get("/")).status).toBe(200);
  });
});

describe("GitHub sign-in", () => {
  it("lets the owner in to the start page", async () => {
    const browser = app.browser();

    const callback = await signInWithGithub(browser, owner);
    expect(callback.headers.get("location")).toBe("/");

    const start = await browser.get("/");
    expect(start.status).toBe(200);
    expect(await start.text()).toContain("Signed in as Alex");
  });

  it("takes the owner back to the page they came from", async () => {
    const page = "/generator?brand=e56236~exact&primary=vivid";
    const browser = app.browser();
    const signInPage = (await browser.get(page)).headers.get("location") ?? "";

    const callback = await signInWithGithub(browser, owner, signInPage);

    expect(callback.headers.get("location")).toBe(page);
  });

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])(
    "takes the owner to the start page for next=%s",
    async (next) => {
      const browser = app.browser();

      const callback = await signInWithGithub(browser, owner, `/sign-in?${new URLSearchParams({ next })}`);

      expect(callback.headers.get("location")).toBe("/");
    },
  );

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])(
    "refuses callbackURL=%s even when the sign-in page is bypassed",
    async (callbackURL) => {
      const start = await app.browser().post("/api/auth/sign-in/social", { provider: "github", callbackURL });

      expect(start.status).toBe(403);
    },
  );

  it("turns away another GitHub account without registering it", async () => {
    const browser = app.browser();

    const callback = await signInWithGithub(browser, stranger);
    expect(callback.headers.get("location")).toMatch(/^\/sign-in\?error=not_owner/);

    expect((await browser.get("/")).status).toBe(307);
    const registered = await getDb().query.user.findFirst({ where: (row, { eq }) => eq(row.email, stranger.email) });
    expect(registered).toBeUndefined();
  });

  it("turns away another GitHub account that already has a user row", async () => {
    // A leftover row, e.g. from before OWNER_GITHUB_ID pointed elsewhere.
    await getDb().insert(user).values({ id: "former-user", name: formerMember.name, email: formerMember.email });
    await getDb()
      .insert(account)
      .values({ id: "former-account", userId: "former-user", providerId: "github", accountId: String(formerMember.id) });
    const browser = app.browser();

    const callback = await signInWithGithub(browser, formerMember);
    expect(callback.headers.get("location")).toMatch(/^\/sign-in\?error=not_owner/);

    expect((await browser.get("/")).status).toBe(307);
  });

  it("turns away another GitHub account with the owner's email and does not link it", async () => {
    await signInWithGithub(app.browser(), owner);
    const browser = app.browser();

    const callback = await signInWithGithub(browser, impostor);
    expect(callback.headers.get("location")).toMatch(/^\/sign-in\?error=not_owner/);

    expect((await browser.get("/")).status).toBe(307);
    const linked = await getDb().query.account.findFirst({
      where: (row, { eq }) => eq(row.accountId, String(impostor.id)),
    });
    expect(linked).toBeUndefined();
  });

  it("ends the owner's session when OWNER_GITHUB_ID changes", async () => {
    const browser = app.browser();
    await signInWithGithub(browser, owner);

    process.env.OWNER_GITHUB_ID = String(stranger.id);
    try {
      expect((await browser.get("/")).status).toBe(307);
    } finally {
      process.env.OWNER_GITHUB_ID = String(owner.id);
    }
  });
});


describe("localized page and server-function boundaries", () => {
  it.each([undefined, "xx", "en", "de"])("renders SSR using cookie %s, ignoring Accept-Language", async (locale) => {
    const browser = app.browser();
    if (locale) browser.setCookie("PARAGLIDE_LOCALE", locale);
    const response = await browser.get("/sign-in", { "accept-language": "de-DE" });
    const html = await response.text();
    expect(response.status, html).toBe(200);
    expect(html).toContain(`<html lang="${locale === "de" ? "de" : "en"}">`);
    expect(html).toContain(locale === "de" ? "Mit GitHub anmelden" : "Sign in with GitHub");
  });

  it("protects HEAD and follows legacy pages through the owner gate", async () => {
    const browser = app.browser();
    const old = await browser.send("/referenzen/hotel?x=a%2Bb&x=a+b", { method: "HEAD" });
    expect(old.status).toBe(308);
    expect(old.headers.get("location")).toBe("/references/hotel?x=a%2Bb&x=a+b");
    expect(await old.text()).toBe("");
    const gated = await browser.send(old.headers.get("location") ?? "", { method: "HEAD" });
    expect(gated.status).toBe(307);
    expect(new URL(gated.headers.get("location") ?? "", testOrigin).searchParams.get("next")).toBe("/references/hotel?x=a%2Bb&x=a+b");
  });

  it("preserves a legacy return path on recoverable and global OAuth errors", async () => {
    const browser = app.browser();
    const callback = await signInWithGithub(browser, stranger, "/sign-in?next=%2Fschriften%2Fnew%3Fx%3D1");
    const location = new URL(callback.headers.get("location") ?? "", testOrigin);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("error")).toBe("not_owner");
    expect(location.searchParams.get("next")).toBe("/type-pairings/new/view?x=1");
    const global = app.browser();
    await global.post("/api/auth/sign-in/social", { provider: "github", callbackURL: "/collections/sommer?x=1" });
    const error = await global.get("/api/auth/callback/github?error=access_denied&state=invalid");
    const errorUrl = new URL(error.headers.get("location") ?? "", testOrigin);
    expect(errorUrl.pathname).toBe("/sign-in");
    expect(errorUrl.searchParams.get("next")).toBe("/collections/sommer?x=1");
  });

  it("localizes normal and early validation concurrently without first-request language freeze", async () => {
    const browser = app.browser();
    await signInWithGithub(browser, owner);
    const upload = await app.serverFunctionUrl("/src/server/library.functions.ts", "uploadImage");
    const early = await app.serverFunctionUrl("/src/server/brand-kits.functions.ts", "updateBrandKitNotes");
    const token = await app.serverFunctionUrl("/src/server/mcp-tokens.functions.ts", "createMcpToken");
    const requests = ["en", "de", "en", "de"].map(async (locale) => {
      // Each request carries its own locale while retaining the signed-in session.
      const localized = { ...browser, send: (path: string, init: RequestInit = {}) => {
        browser.setCookie("PARAGLIDE_LOCALE", locale);
        return browser.send(path, init);
      } };
      const data = new FormData();
      data.set("title", "x".repeat(201));
      const result = await callServerFunction(localized, upload, data, "POST");
      expect(result).toEqual({ ok: false, reason: locale === "de" ? "Verwende für Titel höchstens 200 Zeichen." : "Use at most 200 characters for Title." });
      await expect(callServerFunction(localized, early, { slug: "unknown", notes: "x".repeat(5001) }, "POST")).rejects.toThrow(locale === "de" ? "Verwende für Hinweise höchstens 4.000 Zeichen." : "Use at most 4,000 characters for Notes.");
      const emptyToken = new FormData();
      emptyToken.set("name", " ");
      emptyToken.set("expiresInDays", "90");
      await expect(callServerFunction(localized, token, emptyToken, "POST")).rejects.toThrow(locale === "de" ? "Bitte fülle Name aus." : "Enter a value for Name.");
    });
    await Promise.all(requests);
  });
});
