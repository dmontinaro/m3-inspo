/**
 * Source and owner tags, set in the upload sheet or the edit form, checked
 * where they are used: in the detail view, the gallery filters and search, the
 * tag suggestions and what a coding agent gets over MCP.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { getReference, listGallery, listTags, setReferenceFavorite, updateReference } from "./server/library.functions";
import type { GalleryFilters } from "./server/library.server";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 8008, login: "tags-owner", name: "Alex", email: "tags-owner@example.com" };

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

async function getReferenceBySlug(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "getReference");
  return callServerFunction<typeof getReference>(browser, url, { slug });
}

async function gallerySlugs(filters: GalleryFilters) {
  const url = await app.serverFunctionUrl(libraryFile, "listGallery");
  return (await callServerFunction<typeof listGallery>(browser, url, filters)).map((item) => item.slug);
}

async function tagSuggestions() {
  return callServerFunction<typeof listTags>(browser, await app.serverFunctionUrl(libraryFile, "listTags"));
}

/** Sends the detail view's edit form with `tags` as one entry each, plus the tag input's empty text field. */
async function saveTags(slug: string, title: string, tags: string[]) {
  const form = new FormData();
  form.set("slug", slug);
  for (const [name, value] of Object.entries({ title, sourceUrl: "", attribution: "", takeNote: "", avoidNote: "", focus: "" })) {
    form.set(name, value);
  }
  for (const tag of [...tags, ""]) form.append("tags", tag);
  return callServerFunction<typeof updateReference>(browser, await app.serverFunctionUrl(libraryFile, "updateReference"), form);
}

describe("uploading with source and tags", () => {
  it("stores the source as a full web address and the tags trimmed, lowercase and once each", async () => {
    const slug = await uploadScreenshot(app, browser, "Hotel Lärche Startseite", {
      sourceUrl: " hotel-laerche.example/zimmer ",
      tags: ["  Sample-Project ", "hotel", "HOTEL", "Ideas,  Neue   Ideen", ""],
    });

    expect(await getReferenceBySlug(slug)).toMatchObject({
      sourceUrl: "https://hotel-laerche.example/zimmer",
      siteHost: "hotel-laerche.example",
      tags: ["sample-project", "hotel", "ideas", "neue ideen"],
    });
  });

  it("turns away a source that is no web address and tags with other characters, with German reasons", async () => {
    await expect(uploadScreenshot(app, browser, "Ungültige Quelle", { sourceUrl: "javascript:alert(1)" })).rejects.toThrow(
      "Bitte gib eine vollständige Adresse ein, die mit https:// oder http:// beginnt.",
    );
    await expect(uploadScreenshot(app, browser, "Ungültiger Tag", { tags: ["<b>"] })).rejects.toThrow(
      "Tags dürfen nur Buchstaben, Ziffern, Leerzeichen, - und _ enthalten.",
    );
    await expect(uploadScreenshot(app, browser, "Zu viele Tags", { tags: [...Array(21).keys()].map(String) })).rejects.toThrow(
      "Höchstens 20 Tags.",
    );
  });
});

describe("editing tags", () => {
  it("replaces the tags with the form's, and an empty list removes them", async () => {
    const slug = await uploadScreenshot(app, browser, "Pension Bergblick", { tags: ["alt"] });

    expect(await saveTags(slug, "Pension Bergblick", ["Neu", "sample-project"])).toEqual({ ok: true });
    expect((await getReferenceBySlug(slug)).tags).toEqual(["neu", "sample-project"]);

    expect(await saveTags(slug, "Pension Bergblick", [])).toEqual({ ok: true });
    expect((await getReferenceBySlug(slug)).tags).toEqual([]);
  });

  it("answers a German message for invalid tags", async () => {
    const slug = await uploadScreenshot(app, browser, "Pension Talblick");

    expect(await saveTags(slug, "Pension Talblick", ["x".repeat(41)])).toEqual({
      ok: false,
      errors: { tags: ["Ein Tag ist zu lang (höchstens 40 Zeichen)."] },
    });
  });
});

describe("tags in the gallery", () => {
  it("filters by one tag, combined with the other filters", async () => {
    const tagged = await uploadScreenshot(app, browser, "Filter A", { tags: ["filter-projekt"] });
    const taggedFavorite = await uploadScreenshot(app, browser, "Filter B", { tags: ["Filter-Projekt", "hotel"] });
    await uploadScreenshot(app, browser, "Filter C", { tags: ["anderes-projekt"] });
    const url = await app.serverFunctionUrl(libraryFile, "setReferenceFavorite");
    await callServerFunction<typeof setReferenceFavorite>(browser, url, { slug: taggedFavorite, isFavorite: true }, "POST");

    expect(await gallerySlugs({ tag: "filter-projekt" })).toEqual([taggedFavorite, tagged]);
    expect(await gallerySlugs({ tag: "filter-projekt", favorites: true })).toEqual([taggedFavorite]);
    expect(await gallerySlugs({ tag: "filter-projekt", query: "Filter A" })).toEqual([tagged]);
  });

  it("finds references by a tag in the text search, also by a part of it", async () => {
    const slug = await uploadScreenshot(app, browser, "Suchtreffer", { tags: ["zirbenstube-relaunch"] });

    expect(await gallerySlugs({ query: "zirbenstube-relaunch" })).toEqual([slug]);
    expect(await gallerySlugs({ query: "relaunch" })).toEqual([slug]);
  });

  it("suggests every tag in use once, the most used first", async () => {
    await uploadScreenshot(app, browser, "Vorschlag 1", { tags: ["vorschlag-selten", "vorschlag-oft"] });
    await uploadScreenshot(app, browser, "Vorschlag 2", { tags: ["vorschlag-oft", "vorschlag-mittel"] });
    await uploadScreenshot(app, browser, "Vorschlag 3", { tags: ["vorschlag-oft", "vorschlag-mittel"] });

    const suggestions = (await tagSuggestions()).filter((tag) => tag.startsWith("vorschlag-"));

    expect(suggestions).toEqual(["vorschlag-oft", "vorschlag-mittel", "vorschlag-selten"]);
  });
});

describe("the owner's words over MCP", () => {
  const agent = async () => connectMcp(app, (await createMcpToken(app, browser)).token);
  const foundSlugs = async (client: Awaited<ReturnType<typeof agent>>, query: string) => {
    const { json } = await callTool(client, "search_screens", { query });
    return z.object({ results: z.array(z.object({ slug: z.string() })) }).parse(json).results.map((row) => row.slug);
  };

  it("tags reach agents in `taste` and match their text search", async () => {
    const slug = await uploadScreenshot(app, browser, "Almwiese Buchung", { tags: ["mcp-projekt", "hotel"] });
    const client = await agent();

    expect((await callTool(client, "get_screen", { slug })).json).toMatchObject({
      taste: { tags: ["mcp-projekt", "hotel"] },
    });
    expect(await foundSlugs(client, "mcp-projekt")).toEqual([slug]);
  });

  it("notes match an agent's text search", async () => {
    const slug = await uploadScreenshot(app, browser, "Seealm Startseite", {
      takeNote: "Gelassene Kursivschrift, viel Weißraum",
    });
    const client = await agent();

    // Words no other test file writes: all files share one catalogue.
    expect(await foundSlugs(client, "gelassene Kursivschrift")).toEqual([slug]);
  });
});
