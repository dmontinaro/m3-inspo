/**
 * Curating references through the server functions the detail view and the
 * gallery call, checked where it matters: in the gallery, at the image route
 * and in what a coding agent gets over MCP.
 */

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { referenceCaptures, references } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type {
  deleteReference,
  getReference,
  listGallery,
  setReferenceFavorite,
  setReferenceStatus,
  updateReference,
} from "./server/library.functions";
import type { GalleryFilters } from "./server/library.server";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 7007, login: "curation-owner", name: "Alex", email: "curation-owner@example.com" };

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

const libraryFile = "/src/server/library.functions.ts";

async function setStatus(slug: string, status: "draft" | "approved" | "archived") {
  const url = await app.serverFunctionUrl(libraryFile, "setReferenceStatus");
  await callServerFunction<typeof setReferenceStatus>(browser, url, { slug, status }, "POST");
}

async function setFavorite(slug: string, isFavorite: boolean) {
  const url = await app.serverFunctionUrl(libraryFile, "setReferenceFavorite");
  await callServerFunction<typeof setReferenceFavorite>(browser, url, { slug, isFavorite }, "POST");
}

/** The detail view's edit form with every field empty, the format on desktop. */
const editForm = { title: "", sourceUrl: "", attribution: "", takeNote: "", avoidNote: "", focus: "", device: "desktop" };

/** A phone screenshot: 1170 × 2532, an iPhone screen. */
const phoneScreen = () =>
  sharp({ create: { width: 1170, height: 2532, channels: 3, background: "#e7eef4" } })
    .png()
    .toBuffer();

/** Sends the detail view's edit form for `slug`, or only some fields, as the inline edits do. */
async function save(slug: string, fields: Partial<typeof editForm>) {
  const form = new FormData();
  form.set("slug", slug);
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const url = await app.serverFunctionUrl(libraryFile, "updateReference");
  return callServerFunction<typeof updateReference>(browser, url, form);
}

async function getReferenceBySlug(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "getReference");
  return callServerFunction<typeof getReference>(browser, url, { slug });
}

async function remove(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "deleteReference");
  await callServerFunction<typeof deleteReference>(browser, url, { slug }, "POST");
}

async function gallery(filters?: GalleryFilters) {
  const url = await app.serverFunctionUrl(libraryFile, "listGallery");
  return callServerFunction<typeof listGallery>(browser, url, filters);
}

async function agent() {
  return connectMcp(app, (await createMcpToken(app, browser)).token);
}

const screenList = z.object({ results: z.array(z.object({ slug: z.string() })) });

describe("what agents see over MCP", () => {
  it("leaves out drafts and archived references in every tool", async () => {
    const approved = await uploadScreenshot(app, browser, "Wellness Alpin freigegeben");
    const draft = await uploadScreenshot(app, browser, "Wellness Alpin Entwurf");
    const archived = await uploadScreenshot(app, browser, "Wellness Alpin archiviert");
    await setStatus(draft, "draft");
    await setStatus(archived, "archived");
    const client = await agent();

    const search = await callTool(client, "search_screens", { query: "wellness alpin" });
    expect(screenList.parse(search.json).results.map((row) => row.slug)).toEqual([approved]);
    for (const slug of [draft, archived]) {
      expect((await callTool(client, "get_screen", { slug })).json.error).toBe(`No screen with slug '${slug}'.`);
    }
  });

  it("sees approval, edited notes and archiving on the next request", async () => {
    const slug = await uploadScreenshot(app, browser, "Chalet Morgenrot Zimmer", { takeNote: "Große Fotos" });
    await setStatus(slug, "draft");
    const client = await agent();
    const getScreen = async () => (await callTool(client, "get_screen", { slug })).json;
    expect((await getScreen()).error).toBeDefined();

    await setStatus(slug, "approved");
    expect(await getScreen()).toMatchObject({ slug, taste: { take: "Große Fotos" } });

    await save(slug, {
      ...editForm,
      title: "Chalet Morgenrot Zimmer",
      takeNote: "Nur die Bildsprache",
      avoidNote: "Keine Slider",
      focus: "hero",
    });
    await setFavorite(slug, true);
    expect((await getScreen()).taste).toEqual({
      take: "Nur die Bildsprache",
      avoid: "Keine Slider",
      focus: "hero",
      isFavorite: true,
      tags: [],
    });

    await setStatus(slug, "archived");
    expect((await getScreen()).error).toBe(`No screen with slug '${slug}'.`);
  });

  it("finds an uploaded app screen with the mobile device filter", async () => {
    const phone = await uploadScreenshot(app, browser, "Gästemappe Kranzhof App", { png: await phoneScreen() });
    await uploadScreenshot(app, browser, "Gästemappe Kranzhof Website");
    const client = await agent();

    const search = await callTool(client, "search_screens", { query: "gästemappe kranzhof", device: "mobile" });
    expect(screenList.parse(search.json).results.map((row) => row.slug)).toEqual([phone]);
  });
});

describe("deleting a reference for good", () => {
  it("removes its images in every size, its rows and its MCP entry", async () => {
    const slug = await uploadScreenshot(app, browser, "Almhütte Speisekarte", { takeNote: "Handschrift-Akzente" });
    const [{ id }] = await getDb().select({ id: references.id }).from(references).where(eq(references.slug, slug));
    const [capture] = (await getReferenceBySlug(slug)).captures;
    const thumbnail = (await gallery()).find((item) => item.slug === slug);
    const images = [capture.originalUrl, capture.preview.url, thumbnail?.thumbUrl];
    for (const path of images) expect((await browser.get(String(path))).status, path).toBe(200);
    const client = await agent();

    await remove(slug);

    for (const path of images) expect((await browser.get(String(path))).status, path).toBe(404);
    await expect(getReferenceBySlug(slug)).rejects.toThrow();
    expect((await gallery()).map((item) => item.slug)).not.toContain(slug);
    expect((await callTool(client, "get_screen", { slug })).json.error).toBe(`No screen with slug '${slug}'.`);
    expect(await getDb().select().from(references).where(eq(references.id, id))).toEqual([]);
    expect(await getDb().select().from(referenceCaptures).where(eq(referenceCaptures.referenceId, id))).toEqual([]);
  });
});

describe("the gallery", () => {
  const slugsIn = async (filters?: GalleryFilters) => (await gallery(filters)).map((item) => item.slug);

  it("shows drafts and approved references until filtered by status or favorite", async () => {
    const plain = await uploadScreenshot(app, browser, "Fjordlodge Standard");
    const draft = await uploadScreenshot(app, browser, "Fjordlodge Entwurf");
    const favorite = await uploadScreenshot(app, browser, "Fjordlodge Favorit");
    const archived = await uploadScreenshot(app, browser, "Fjordlodge Archiv");
    await setStatus(draft, "draft");
    await setFavorite(favorite, true);
    await setStatus(archived, "archived");

    const all = await slugsIn();
    expect(all).toEqual(expect.arrayContaining([plain, draft, favorite]));
    expect(all).not.toContain(archived);

    const drafts = await gallery({ status: "draft" });
    expect(drafts.map((item) => item.slug)).toContain(draft);
    expect(drafts.every((item) => item.curationStatus === "draft")).toBe(true);

    const archive = await gallery({ status: "archived" });
    expect(archive.map((item) => item.slug)).toContain(archived);
    expect(archive.every((item) => item.curationStatus === "archived")).toBe(true);

    const favorites = await gallery({ favorites: true });
    expect(favorites.map((item) => item.slug)).toContain(favorite);
    expect(favorites.every((item) => item.isFavorite)).toBe(true);
  });

  it("finds references by words from their notes, also by the start of a word", async () => {
    const linde = await uploadScreenshot(app, browser, "Gasthof Linde", {
      takeNote: "Serifenschrift mit viel Luft",
      avoidNote: "Kein Karussell",
    });
    const eiche = await uploadScreenshot(app, browser, "Gasthof Eiche", { takeNote: "Kräftige Farbflächen" });

    expect(await slugsIn({ query: "karussell" })).toEqual([linde]);
    expect(await slugsIn({ query: "Serifen" })).toEqual([linde]);
    expect(await slugsIn({ query: "gasthof farbfl" })).toEqual([eiche]);
    // Characters with a meaning in Postgres search syntax are plain text here.
    expect(await slugsIn({ query: "luft & !(serif:*" })).toEqual([linde]);
  });

  it("marks an upload in a phone screen's proportions as mobile and filters by format", async () => {
    const phone = await uploadScreenshot(app, browser, "Seealm App Check-in", { png: await phoneScreen() });
    const desktop = await uploadScreenshot(app, browser, "Seealm Startseite");

    expect((await getReferenceBySlug(phone)).device).toBe("mobile");
    expect((await getReferenceBySlug(desktop)).device).toBe("desktop");

    const mobile = await gallery({ device: "mobile" });
    expect(mobile.map((item) => item.slug)).toContain(phone);
    expect(mobile.every((item) => item.device === "mobile")).toBe(true);
    const desktops = await slugsIn({ device: "desktop" });
    expect(desktops).toContain(desktop);
    expect(desktops).not.toContain(phone);
  });
});

describe("editing a reference", () => {
  it("saves every field, trimmed, completes a bare web address and keeps the slug", async () => {
    const slug = await uploadScreenshot(app, browser, "Seehotel Startseite");

    const result = await save(slug, {
      title: "  Seehotel am Wolfgangsee  ",
      sourceUrl: "www.seehotel.example/zimmer",
      attribution: "Studio Nord",
      takeNote: "Viel Weißraum",
      avoidNote: "",
      focus: "navigation",
      device: "mobile",
    });

    expect(result).toEqual({ ok: true });
    expect(await getReferenceBySlug(slug)).toMatchObject({
      slug,
      title: "Seehotel am Wolfgangsee",
      sourceUrl: "https://www.seehotel.example/zimmer",
      attribution: "Studio Nord",
      takeNote: "Viel Weißraum",
      avoidNote: null,
      focus: "navigation",
      device: "mobile",
    });
  });

  it("turns away invalid fields with German messages and keeps the saved values", async () => {
    const slug = await uploadScreenshot(app, browser, "Berghof Buchung", { takeNote: "Klare Schritte" });

    const result = await save(slug, {
      title: " ",
      sourceUrl: "javascript:alert(1)",
      attribution: "x".repeat(201),
      takeNote: "x".repeat(5001),
      avoidNote: "",
      focus: "sidebar",
      device: "tablet",
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        title: ["Bitte gib einen Titel ein."],
        sourceUrl: ["Bitte gib eine vollständige Adresse ein, die mit https:// oder http:// beginnt."],
        attribution: ["Der Urheberhinweis ist zu lang (höchstens 200 Zeichen)."],
        takeNote: ["Die Notiz ist zu lang (höchstens 5000 Zeichen)."],
        focus: ["Bitte wähle einen Fokus aus der Liste."],
        device: ["Bitte wähle ein Format aus der Liste."],
      },
    });
    expect(await getReferenceBySlug(slug)).toMatchObject({ title: "Berghof Buchung", takeNote: "Klare Schritte" });
  });

  it("saves a single field inline and keeps the others, tags included", async () => {
    const slug = await uploadScreenshot(app, browser, "Almhof Zimmer", { takeNote: "Ruhige Farben", tags: ["hotel"] });

    expect(await save(slug, { sourceUrl: "almhof.example" })).toEqual({ ok: true });
    expect(await getReferenceBySlug(slug)).toMatchObject({
      title: "Almhof Zimmer",
      takeNote: "Ruhige Farben",
      tags: ["hotel"],
      sourceUrl: "https://almhof.example",
      siteHost: "almhof.example",
    });
  });
});
