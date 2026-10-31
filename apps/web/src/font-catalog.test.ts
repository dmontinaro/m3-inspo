/**
 * The font catalog: a sync mirrors Fontsource (faked at the network boundary,
 * test/fake-fontsource.ts) into the database, a failed sync keeps the last
 * state, and the owner searches the catalog by family and category.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { fontsourceFamily, useFakeFontsource } from "./test/fake-fontsource";
import { findCatalogFont, startFontCatalogSync, syncFontCatalog } from "./server/font-catalog.server";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { searchFontCatalog } from "./server/font-catalog.functions";

const owner: GithubAccount = { id: 6363, login: "font-owner", name: "Alex", email: "font-owner@example.com" };

const inter = fontsourceFamily({ id: "inter", family: "Inter", variable: true, weights: [100, 400, 900] });
const interTight = fontsourceFamily({ id: "inter-tight", family: "Inter Tight", variable: true });
const fraunces = fontsourceFamily({ id: "fraunces", family: "Fraunces", category: "serif", variable: true });
const jetbrains = fontsourceFamily({ id: "jetbrains-mono", family: "JetBrains Mono", category: "monospace" });
const caveat = fontsourceFamily({ id: "caveat", family: "Caveat", category: "handwriting" });
const icons = fontsourceFamily({ id: "material-icons", family: "Material Icons", category: "icons" });
const odd = fontsourceFamily({ id: "odd-one", family: "Odd One", category: "other", type: "other", license: "Apache-2.0" });

const fontsource = useFakeFontsource([]);

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

beforeEach(async () => {
  fontsource.failing = false;
  fontsource.families = [inter, interTight, fraunces, jetbrains, caveat, icons, odd];
  await syncFontCatalog();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

async function search(query: string, category?: "serif" | "sans" | "mono" | "display" | "handwriting") {
  const url = await app.serverFunctionUrl("/src/server/font-catalog.functions.ts", "searchFontCatalog");
  return (await callServerFunction<typeof searchFontCatalog>(browser, url, { query, category })).map((font) => font.family);
}

describe("sync", () => {
  it("mirrors Fontsource with our categories and leaves icon fonts out", async () => {
    expect(await findCatalogFont("Fraunces")).toMatchObject({ id: "fraunces", category: "serif" });
    expect(await findCatalogFont("JetBrains Mono")).toMatchObject({ category: "mono", variable: false });
    expect(await findCatalogFont("Caveat")).toMatchObject({ category: "handwriting" });
    expect(await findCatalogFont("Odd One")).toMatchObject({ category: "display", google: false, license: "Apache-2.0" });
    expect(await findCatalogFont("Material Icons")).toBeNull();
  });

  it("updates families on the next sync instead of adding them twice, and drops removed ones", async () => {
    fontsource.families = [{ ...inter, weights: [400, 500], lastModified: "2026-09-10" }, fraunces];
    expect(await syncFontCatalog()).toBe(2);

    expect(await findCatalogFont("Inter")).toMatchObject({ weights: [400, 500], lastModified: "2026-09-10" });
    expect(await search("inter")).toEqual(["Inter"]);
    expect(await findCatalogFont("JetBrains Mono")).toBeNull();
  });

  it.each([
    ["Fontsource is down", () => (fontsource.failing = true)],
    ["Fontsource sends an empty list", () => (fontsource.families = [])],
    ["Fontsource sends no list", () => (fontsource.families = { fonts: [inter] } as unknown as unknown[])],
    ["no entry is usable", () => (fontsource.families = [{ id: "broken" }, icons])],
  ])("keeps the last state when %s", async (_case, breakFontsource) => {
    breakFontsource();
    await expect(syncFontCatalog()).rejects.toThrow();
    expect(await search("", "sans")).toEqual(["Inter", "Inter Tight"]);
  });

  it("logs a failed sync at startup instead of stopping the server", async () => {
    fontsource.failing = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const requestsBefore = fontsource.requests;
    // A fresh catalog would not sync again for a day; make it look stale.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2 * 86_400_000 });

    const stop = startFontCatalogSync();
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining("[fonts] catalog sync failed")));
    stop();

    vi.useRealTimers();
    errors.mockRestore();
    expect(fontsource.requests).toBe(requestsBefore + 1);
  });
});

describe("lookup and search", () => {
  it("finds a family regardless of case and names the CSS family of its variable package", async () => {
    expect(await findCatalogFont("  inter ")).toMatchObject({ id: "inter", family: "Inter", cssFamily: "Inter Variable" });
    expect(await findCatalogFont("jetbrains mono")).toMatchObject({ cssFamily: "JetBrains Mono" });
    expect(await findCatalogFont("PP Neue Montreal")).toBeNull();
  });

  it("searches by family regardless of case, prefix matches first", async () => {
    expect(await search("INTER")).toEqual(["Inter", "Inter Tight"]);
    expect(await search("one")).toEqual(["Odd One"]);
    expect(await search("tight")).toEqual(["Inter Tight"]);
  });

  it("filters by category", async () => {
    expect(await search("", "serif")).toEqual(["Fraunces"]);
    expect(await search("", "mono")).toEqual(["JetBrains Mono"]);
    expect(await search("inter", "serif")).toEqual([]);
  });

  it("treats LIKE wildcards in the query as plain text", async () => {
    expect(await search("%")).toEqual([]);
    expect(await search("_")).toEqual([]);
  });
});
