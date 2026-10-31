import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { probeLocale } from "./server/paraglide-spike.functions";
import type { TestApp, TestBrowser } from "./test/app";

const owner = {
  id: 91827,
  login: "paraglide-spike-owner",
  name: "Spike Owner",
  email: "paraglide-spike-owner@example.com",
};
const messages = { en: "Please enter a title.", de: "Bitte gib einen Titel ein." };

let app: TestApp;
let endpoint: string;
let english: TestBrowser;
let german: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  endpoint = await app.serverFunctionUrl("/src/server/paraglide-spike.functions.ts", "probeLocale");
  english = app.browser();
  german = app.browser();
  await signInWithGithub(english, owner);
  await signInWithGithub(german, owner);
  english.setCookie("PARAGLIDE_LOCALE", "en");
  german.setCookie("PARAGLIDE_LOCALE", "de");
}, 60_000);

afterAll(async () => {
  await app?.close();
  vi.unstubAllGlobals();
});

describe("Paraglide against the actual Start request handler", () => {
  it.each([
    { cookie: undefined, expected: "en", text: "Private design library" },
    { cookie: "en", expected: "en", text: "Private design library" },
    { cookie: "de", expected: "de", text: "Private Designbibliothek" },
    { cookie: "invalid", expected: "en", text: "Private design library" },
  ])("renders the first HTML for cookie=$cookie in $expected", async ({ cookie, expected, text }) => {
    const browser = app.browser();
    if (cookie) browser.setCookie("PARAGLIDE_LOCALE", cookie);

    const response = await browser.get("/anmelden?next=%2Fgenerator%3Fbrand%3D123456", {
      "accept-language": "de-DE,de;q=0.9",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain(`<html lang="${expected}">`);
    expect(html).toContain(text);
  });

  it("keeps locale inside each direct server-function request after asynchronous overlap", async () => {
    const results = await Promise.all(
      Array.from({ length: 24 }, async (_, index) => {
        const locale = index % 2 === 0 ? "en" : "de";
        const result = await callServerFunction<typeof probeLocale>(
          locale === "en" ? english : german,
          endpoint,
          { title: "", delay: 5 + (index % 5) * 10 },
          "POST",
        );
        return { locale, result };
      }),
    );

    for (const { locale, result } of results) {
      expect(result).toEqual({ before: locale, after: locale, errors: [messages[locale]] });
    }
  });

  it("keeps the owner gate and CSRF check around the added server function", async () => {
    const anonymous = app.browser();
    anonymous.setCookie("PARAGLIDE_LOCALE", "de");
    const unauthenticated = await anonymous.send(endpoint, {
      method: "POST",
      headers: { "x-tsr-serverFn": "true" },
    });
    expect(unauthenticated.status).toBe(401);

    const crossSite = await german.send(endpoint, {
      method: "POST",
      headers: {
        "x-tsr-serverFn": "true",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(crossSite.status).toBe(403);
  });

  it("keeps MCP and worker requests token protected without a language redirect", async () => {
    for (const path of ["/api/mcp", "/api/worker/claim"]) {
      const response = await app.fetch(path, {
        method: "POST",
        headers: { cookie: "PARAGLIDE_LOCALE=de" },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).not.toContain("<html");
    }
  });
});
