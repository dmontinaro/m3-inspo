import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { account, user } from "@m3-inspo/db/auth-schema";
import { getDb } from "@m3-inspo/db/client";
import { startTestApp, testOrigin } from "./test/app";
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
    expect(response.headers.get("location")).toBe("/anmelden");
  });

  it("sends any other page to sign-in with the page as `next`", async () => {
    const page = "/generator?brand=e56236~exact&primary=vivid";

    const response = await app.browser().get(page);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "", testOrigin);
    expect(location.pathname).toBe("/anmelden");
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
    expect((await browser.get("/anmelden")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
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
    expect(await start.text()).toContain("Angemeldet als Alex");
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

      const callback = await signInWithGithub(browser, owner, `/anmelden?${new URLSearchParams({ next })}`);

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
    expect(callback.headers.get("location")).toMatch(/^\/anmelden\?error=not_owner/);

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
    expect(callback.headers.get("location")).toMatch(/^\/anmelden\?error=not_owner/);

    expect((await browser.get("/")).status).toBe(307);
  });

  it("turns away another GitHub account with the owner's email and does not link it", async () => {
    await signInWithGithub(app.browser(), owner);
    const browser = app.browser();

    const callback = await signInWithGithub(browser, impostor);
    expect(callback.headers.get("location")).toMatch(/^\/anmelden\?error=not_owner/);

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
