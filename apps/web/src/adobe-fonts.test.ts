/**
 * Adobe families in type pairings with ADOBE_FONTS_API_TOKEN (#88): saving
 * looks a family up at Adobe Fonts (faked at the network boundary,
 * test/fake-adobe-fonts.ts) and puts it into the one preview kit the app
 * keeps; unknown names are refused; the startup sync takes in families
 * saved before the token was set.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callServerFunction, startTestApp } from "./test/app";
import { fakeAdobeToken, useFakeAdobeFonts } from "./test/fake-adobe-fonts";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { syncAdobePreviewKit } from "./server/type-pairings.server";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { RoleFont } from "#/lib/fonts";
import type { getAdobePreviewKitId } from "./server/adobe-fonts.functions";
import type { addTypePairing, getTypePairing } from "./server/type-pairings.functions";

const owner: GithubAccount = { id: 6565, login: "adobe-owner", name: "Alex", email: "adobe-owner@example.com" };

const adobe = useFakeAdobeFonts([
  { id: "unic", name: "Neue Haas Unica", slug: "neue-haas-unica" },
  { id: "rcrd", name: "Recoleta", slug: "recoleta" },
  { id: "frtr", name: "Futura PT", slug: "futura-pt" },
]);

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id), ADOBE_FONTS_API_TOKEN: fakeAdobeToken });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const pairingsFile = "/src/server/type-pairings.functions.ts";

const typed = (family: string, weights = [400]): RoleFont => ({ family, weights, category: "sans", source: "adobe" });
const local = (family: string): RoleFont => ({ family, weights: [400], category: "sans", source: "local" });

async function save(name: string, roles: { heading: RoleFont; body: RoleFont }) {
  const url = await app.serverFunctionUrl(pairingsFile, "addTypePairing");
  return callServerFunction<typeof addTypePairing>(browser, url, { name, note: "", roles }, "POST");
}

async function pairing(slug: string) {
  const url = await app.serverFunctionUrl(pairingsFile, "getTypePairing");
  return callServerFunction<typeof getTypePairing>(browser, url, { slug });
}

/** The preview kit, once the background update after a save has reached it. */
const previewKit = () => vi.waitFor(() => adobe.kits.find((kit) => kit.name === "Inspo Vorschau (localhost)") ?? expect.fail("no kit"));

describe("saving an Adobe family", () => {
  it("spells it as Adobe does, keeps its slug and puts it into the published preview kit", async () => {
    const result = await save("Unica mit Kandidat", { heading: typed(" neue haas UNICA ", [700]), body: local("Kandidat Lokal") });
    if (result.status !== "saved") throw new Error(JSON.stringify(result));

    expect((await pairing(result.slug)).roles.heading).toEqual({
      family: "Neue Haas Unica",
      weights: [700],
      category: "sans",
      source: "adobe",
      adobeSlug: "neue-haas-unica",
    });
    const kit = await previewKit();
    await vi.waitFor(() => expect(kit.families).toContain("unic"));
    expect(kit).toMatchObject({ domains: ["localhost"], segmentedCssNames: "false" });
    await vi.waitFor(() => expect(kit.published).toBeGreaterThan(0));

    const url = await app.serverFunctionUrl("/src/server/adobe-fonts.functions.ts", "getAdobePreviewKitId");
    expect(await callServerFunction<typeof getAdobePreviewKitId>(browser, url)).toBe(kit.id);
  });

  it("refuses a name Adobe does not know", async () => {
    expect(await save("Vertippt", { heading: typed("Neue Hass Unica"), body: local("Vertippt Lokal") })).toEqual({
      status: "invalid",
      errors: { roles: ["Adobe Fonts kennt „Neue Hass Unica“ nicht. Schreib den Namen wie auf fonts.adobe.com."] },
    });
  });

  it("publishes the kit only when a family is new to it", async () => {
    await save("Recoleta eins", { heading: typed("Recoleta", [600]), body: local("Recoleta Lokal eins") });
    const kit = await previewKit();
    await vi.waitFor(() => expect(kit.families).toContain("rcrd"));
    const published = kit.published;

    await save("Recoleta zwei", { heading: typed("Recoleta", [800]), body: local("Recoleta Lokal zwei") });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(kit.published).toBe(published);
    expect(kit.families.filter((id) => id === "rcrd")).toHaveLength(1);
  });
});

describe("startup sync", () => {
  it("adds families saved before the token was set", async () => {
    vi.stubEnv("ADOBE_FONTS_API_TOKEN", "");
    const result = await save("Futura ohne Token", { heading: typed("Futura PT"), body: local("Futura Lokal") });
    vi.unstubAllEnvs();
    if (result.status !== "saved") throw new Error(JSON.stringify(result));
    expect((await pairing(result.slug)).roles.heading).not.toHaveProperty("adobeSlug");

    expect(await syncAdobePreviewKit()).toContain("frtr");
    expect((await previewKit()).families).toContain("frtr");
  });
});
