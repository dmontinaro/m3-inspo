/**
 * „Color Scheme daraus“ on a reference and on a collection: the link each
 * page renders, and the generator that link opens. Other test files add
 * references to the same database in parallel, so titles carry this file's
 * run marker.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { addCollection, addReferenceToCollection } from "./server/collections.functions";

const owner: GithubAccount = { id: 5151, login: "entry-owner", name: "Alex", email: "entry-owner@example.com" };
const run = randomUUID().slice(0, 8);

let app: TestApp;
let browser: TestBrowser;
let hotel = "";
let plain = "";
let collection = "";

/** Uploads an approved reference, with this DOM-measured palette if given, and returns its slug. */
async function addReference(title: string, palette?: string[]) {
  const slug = await uploadScreenshot(app, browser, `${title} ${run}`);
  const row = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
  const id = row?.id ?? "";
  if (palette) {
    await getDb()
      .insert(referenceAnalyses)
      .values({
        referenceId: id,
        version: 1,
        mode: "light",
        generatedBy: "analysis",
        model: "claude-opus-5-5",
        tokens: { palette: palette.map((value) => ({ value, source: "dom" as const })) },
      });
  }
  await getDb().update(references).set({ curationStatus: "approved" }).where(eq(references.id, id));
  return slug;
}

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  browser.setCookie("PARAGLIDE_LOCALE", "de");
  await signInWithGithub(browser, owner);
  hotel = await addReference("Hotel Einstieg", ["#e56236", "#8a7a72"]);
  plain = await addReference("Ohne Palette");

  const collectionsFile = "/src/server/collections.functions.ts";
  const form = new FormData();
  form.set("name", `Harbor Einstieg ${run}`);
  form.set("description", "");
  form.set("project", "");
  const created = await callServerFunction<typeof addCollection>(browser, await app.serverFunctionUrl(collectionsFile, "addCollection"), form);
  if (!created.ok) throw new Error(JSON.stringify(created.errors));
  collection = created.slug;
  const addUrl = await app.serverFunctionUrl(collectionsFile, "addReferenceToCollection");
  await callServerFunction<typeof addReferenceToCollection>(browser, addUrl, { collection, reference: hotel }, "POST");
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

/** The page's „Color Scheme daraus“ link. */
async function entryLink(path: string) {
  const html = await (await browser.get(path)).text();
  return html.match(/<a [^>]*href="(\/generator[^"]*)"[^>]*>(?:(?!<\/a>).)*Color Scheme daraus/)?.[1];
}

/** Follows a generator link the way the browser does: first to its seed, then the page, as text without React's markers. */
async function openGenerator(href: string) {
  const redirect = await browser.get(href);
  expect(redirect.status).toBe(307);
  const response = await browser.get(redirect.headers.get("location") ?? "");
  expect(response.status).toBe(200);
  return (await response.text()).replaceAll("<!-- -->", "");
}

describe("„Color Scheme daraus“", () => {
  it("on a reference opens the generator with only that reference as the pool, and rolls from it", async () => {
    const href = await entryLink(`/references/${hotel}`);
    expect(href).toBe(`/generator?pool=${hotel}`);

    const html = await openGenerator(href ?? "");
    expect(html).toContain(`Hotel Einstieg ${run}`);
    expect(html).toContain("1 Referenz · 2 Farben");
    expect(html).toContain(`Aus „Hotel Einstieg ${run}“`);
  });

  it("on a collection opens the generator with the collection as the pool, and rolls from it", async () => {
    const href = await entryLink(`/collections/${collection}`);
    expect(href).toBe(`/generator?pool=collection:${collection}`);

    const html = await openGenerator(href ?? "");
    expect(html).toContain(`Harbor Einstieg ${run}`);
    expect(html).toContain(`Aus „Hotel Einstieg ${run}“`);
  });

  it("on a reference without a palette rolls freely, without a reference", async () => {
    const href = await entryLink(`/references/${plain}`);
    expect(href).toBe(`/generator?pool=${plain}`);

    const html = await openGenerator(href ?? "");
    expect(html).toContain("Gewürfelt wird frei, ohne Referenz");
    expect(html).not.toContain("Der Link war nicht ganz lesbar");
  });

  it("is not offered on a draft, which never enters a pool", async () => {
    // Uploads start approved; imports start as drafts.
    const draft = await uploadScreenshot(app, browser, `Entwurf ${run}`);
    await getDb().update(references).set({ curationStatus: "draft" }).where(eq(references.slug, draft));
    expect(await entryLink(`/references/${draft}`)).toBeUndefined();
  });
});
