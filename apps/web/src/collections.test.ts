/**
 * Collections through the server functions the collection pages, the detail
 * view and the gallery call, and what a coding agent gets of them over MCP.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { getReference, listGallery, setReferenceStatus } from "./server/library.functions";
import type { GalleryFilters } from "./server/library.server";
import type {
  addCollection,
  addReferenceToCollection,
  deleteCollection,
  getCollection,
  getCollections,
  removeReferenceFromCollection,
  setCollectionOrder,
  updateCollection,
} from "./server/collections.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 1212, login: "collections-owner", name: "Alex", email: "collections-owner@example.com" };

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  // No embedding provider in tests; search stays lexical.
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id), EMBEDDINGS_API_KEY: "" });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const collectionsFile = "/src/server/collections.functions.ts";

type CollectionForm = { name: string; description?: string; project?: string };

/** The collection form; `slug` only when editing. */
function collectionForm(fields: CollectionForm, slug?: string) {
  const form = new FormData();
  if (slug) form.set("slug", slug);
  form.set("name", fields.name);
  form.set("description", fields.description ?? "");
  form.set("project", fields.project ?? "");
  return form;
}

async function saveNewCollection(fields: CollectionForm) {
  const url = await app.serverFunctionUrl(collectionsFile, "addCollection");
  return callServerFunction<typeof addCollection>(browser, url, collectionForm(fields));
}

async function editCollection(slug: string, fields: CollectionForm) {
  const url = await app.serverFunctionUrl(collectionsFile, "updateCollection");
  return callServerFunction<typeof updateCollection>(browser, url, collectionForm(fields, slug));
}

/** Creates a collection and returns its slug. */
async function createCollection(fields: CollectionForm) {
  const result = await saveNewCollection(fields);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.slug;
}

async function collectionBySlug(slug: string) {
  const url = await app.serverFunctionUrl(collectionsFile, "getCollection");
  return callServerFunction<typeof getCollection>(browser, url, { slug });
}

async function allCollections() {
  return callServerFunction<typeof getCollections>(browser, await app.serverFunctionUrl(collectionsFile, "getCollections"));
}

async function removeCollection(slug: string) {
  const url = await app.serverFunctionUrl(collectionsFile, "deleteCollection");
  await callServerFunction<typeof deleteCollection>(browser, url, { slug }, "POST");
}

async function addTo(collection: string, reference: string) {
  const url = await app.serverFunctionUrl(collectionsFile, "addReferenceToCollection");
  await callServerFunction<typeof addReferenceToCollection>(browser, url, { collection, reference }, "POST");
}

async function removeFrom(collection: string, reference: string) {
  const url = await app.serverFunctionUrl(collectionsFile, "removeReferenceFromCollection");
  await callServerFunction<typeof removeReferenceFromCollection>(browser, url, { collection, reference }, "POST");
}

async function reorder(collection: string, references: string[]) {
  const url = await app.serverFunctionUrl(collectionsFile, "setCollectionOrder");
  await callServerFunction<typeof setCollectionOrder>(browser, url, { collection, references }, "POST");
}

async function setStatus(slug: string, status: "draft" | "approved" | "archived") {
  const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "setReferenceStatus");
  await callServerFunction<typeof setReferenceStatus>(browser, url, { slug, status }, "POST");
}

async function gallerySlugs(filters: GalleryFilters) {
  const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "listGallery");
  return (await callServerFunction<typeof listGallery>(browser, url, filters)).map((item) => item.slug);
}

const memberSlugs = async (slug: string) => (await collectionBySlug(slug)).references.map((reference) => reference.slug);

describe("maintaining collections", () => {
  it("creates, edits and deletes a collection with name, description and project", async () => {
    const slug = await createCollection({ name: "Hotelsoftware", description: "Ruhige Buchungsstrecken", project: " Sample-Project " });

    expect(await collectionBySlug(slug)).toMatchObject({
      slug: "hotelsoftware",
      name: "Hotelsoftware",
      description: "Ruhige Buchungsstrecken",
      project: "sample-project",
      references: [],
    });

    expect(await editCollection(slug, { name: "Hotelsoftware 2026", description: "" })).toEqual({ ok: true });
    expect(await collectionBySlug(slug)).toMatchObject({ slug, name: "Hotelsoftware 2026", description: null, project: null });

    await removeCollection(slug);
    expect((await allCollections()).map((collection) => collection.slug)).not.toContain(slug);
    await expect(collectionBySlug(slug)).rejects.toMatchObject({ isNotFound: true });
  });

  it("answers German messages for a missing name and an invalid project", async () => {
    expect(await saveNewCollection({ name: "  " })).toEqual({ ok: false, errors: { name: ["Bitte gib einen Namen ein."] } });
    expect(await saveNewCollection({ name: "Projekt", project: "<b>" })).toEqual({
      ok: false,
      errors: { project: ["Das Projekt darf nur Buchstaben, Ziffern, Leerzeichen, - und _ enthalten."] },
    });
  });
});

describe("references in a collection", () => {
  it("adds references at the end, once each, and keeps a new order", async () => {
    const collection = await createCollection({ name: "Buchungsstrecken" });
    const [first, second, third] = [
      await uploadScreenshot(app, browser, "Buchung Schritt 1"),
      await uploadScreenshot(app, browser, "Buchung Schritt 2"),
      await uploadScreenshot(app, browser, "Buchung Schritt 3"),
    ];
    await addTo(collection, first);
    await addTo(collection, second);
    await addTo(collection, third);
    await addTo(collection, first);
    expect(await memberSlugs(collection)).toEqual([first, second, third]);

    await reorder(collection, [third, first, second]);
    expect(await memberSlugs(collection)).toEqual([third, first, second]);

    await removeFrom(collection, first);
    await addTo(collection, first);
    expect(await memberSlugs(collection)).toEqual([third, second, first]);
  });

  it("lists every collection with its count, and a reference with the collections it is in", async () => {
    const reference = await uploadScreenshot(app, browser, "Zimmerkarte");
    const withIt = await createCollection({ name: "Zählung Karten" });
    const alsoWithIt = await createCollection({ name: "Zählung Alle" });
    await createCollection({ name: "Zählung Leer" });
    await addTo(withIt, reference);
    await addTo(alsoWithIt, reference);
    await addTo(alsoWithIt, await uploadScreenshot(app, browser, "Zimmerliste"));

    const counted = (await allCollections()).filter((collection) => collection.name.startsWith("Zählung"));
    expect(counted.map(({ name, count, thumbUrls }) => ({ name, count, thumbnails: thumbUrls.length }))).toEqual([
      { name: "Zählung Alle", count: 2, thumbnails: 2 },
      { name: "Zählung Karten", count: 1, thumbnails: 1 },
      { name: "Zählung Leer", count: 0, thumbnails: 0 },
    ]);

    const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "getReference");
    const { collections } = await callServerFunction<typeof getReference>(browser, url, { slug: reference });
    expect(collections).toEqual([
      { slug: alsoWithIt, name: "Zählung Alle" },
      { slug: withIt, name: "Zählung Karten" },
    ]);
  });
});

describe("collections in the gallery", () => {
  it("filters by collection in the collection's order, combined with the other filters", async () => {
    const collection = await createCollection({ name: "Galerie Filter" });
    const older = await uploadScreenshot(app, browser, "Galerie Filter Alt", { tags: ["galerie-filter"] });
    const newer = await uploadScreenshot(app, browser, "Galerie Filter Neu");
    const archived = await uploadScreenshot(app, browser, "Galerie Filter Archiv");
    await uploadScreenshot(app, browser, "Galerie Filter Draußen");
    for (const slug of [older, newer, archived]) await addTo(collection, slug);
    await setStatus(archived, "archived");

    expect(await gallerySlugs({ collection })).toEqual([older, newer]);
    expect(await gallerySlugs({ collection, tag: "galerie-filter" })).toEqual([older]);
    expect(await gallerySlugs({ collection, status: "archived" })).toEqual([archived]);
    expect(await gallerySlugs({ collection: "gibt-es-nicht" })).toEqual([]);
  });
});

describe("collections over MCP", () => {
  const agent = async () => connectMcp(app, (await createMcpToken(app, browser)).token);
  const rowSlugs = (rows: unknown) => z.array(z.object({ slug: z.string() })).parse(rows).map((row) => row.slug);

  it("lists and returns own collections with description and order, only with approved references", async () => {
    const collection = await createCollection({ name: "MCP Ruhige Hotels", description: "Viel Weißraum, leise Farben", project: "sample-project" });
    const empty = await createCollection({ name: "MCP Noch leer" });
    const [first, draft, archived, second] = [
      await uploadScreenshot(app, browser, "MCP Hotel Eins"),
      await uploadScreenshot(app, browser, "MCP Hotel Entwurf"),
      await uploadScreenshot(app, browser, "MCP Hotel Archiv"),
      await uploadScreenshot(app, browser, "MCP Hotel Zwei"),
    ];
    for (const slug of [second, draft, archived, first]) await addTo(collection, slug);
    await setStatus(draft, "draft");
    await setStatus(archived, "archived");
    const client = await agent();

    const { json: list } = await callTool(client, "list_collections", {});
    const listed = z.array(z.object({ slug: z.string() }).loose()).parse(list.issues);
    expect(listed.filter((entry) => [collection, empty].includes(entry.slug))).toEqual([
      expect.objectContaining({ slug: empty, title: "MCP Noch leer", count: 0 }),
      expect.objectContaining({
        slug: collection,
        title: "MCP Ruhige Hotels",
        description: "Viel Weißraum, leise Farben",
        project: "sample-project",
        count: 2,
      }),
    ]);

    const { json } = await callTool(client, "get_collection", { slug: collection });
    expect(json).toMatchObject({ title: "MCP Ruhige Hotels", description: "Viel Weißraum, leise Farben", project: "sample-project" });
    expect(rowSlugs(json.screens)).toEqual([second, first]);
  });

  it("answers an empty collection with an understandable note", async () => {
    const empty = await createCollection({ name: "MCP Leer mit Entwurf" });
    const draft = await uploadScreenshot(app, browser, "MCP Nur Entwurf");
    await addTo(empty, draft);
    await setStatus(draft, "draft");

    const { json } = await callTool(await agent(), "get_collection", { slug: empty });

    expect(json).toMatchObject({ slug: empty, count: 0, screens: [] });
    expect(json.note).toMatch(/no approved references yet/);
  });

  it("uses collection and project as hard filters in search_screens", async () => {
    const collection = await createCollection({ name: "MCP Suchfilter" });
    const inside = await uploadScreenshot(app, browser, "Suchfilter Almhütte drinnen", { tags: ["suchfilter-projekt"] });
    const alsoInside = await uploadScreenshot(app, browser, "Suchfilter Almhütte auch drinnen");
    const outside = await uploadScreenshot(app, browser, "Suchfilter Almhütte draußen", { tags: ["suchfilter-projekt"] });
    await addTo(collection, inside);
    await addTo(collection, alsoInside);
    const client = await agent();
    const search = async (args: Record<string, unknown>) =>
      (await callTool(client, "search_screens", { query: "Suchfilter Almhütte", ...args })).json;

    expect(rowSlugs((await search({})).results).sort()).toEqual([alsoInside, inside, outside].sort());
    expect(rowSlugs((await search({ collection })).results).sort()).toEqual([alsoInside, inside].sort());
    expect(rowSlugs((await search({ project: "Suchfilter-Projekt" })).results).sort()).toEqual([inside, outside].sort());
    expect(rowSlugs((await search({ collection, project: "suchfilter-projekt" })).results)).toEqual([inside]);
    expect(await search({ collection: "gibt-es-nicht" })).toMatchObject({
      error: "No collection with slug 'gibt-es-nicht'",
      validSlugs: expect.arrayContaining([collection]),
    });
  });
});
