/**
 * Embeddings and semantic search: embedding jobs run against a fake
 * the embeddings endpoint with fixed vectors (test/fake-embeddings.ts), then the gallery
 * search, "Ähnliche Referenzen" and the MCP tools rank with them. Without a
 * embeddings key, or when the endpoint fails, text search works as before.
 */

import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { importJobs, referenceAnalyses, referenceEmbeddings, references } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { useFakeEmbeddings } from "./test/fake-embeddings";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import { queueMissingEmbeddings, runNextEmbedding } from "./server/embedding.server";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  deleteReference,
  getReference,
  listGallery,
  setReferenceStatus,
  updateReference,
} from "./server/library.functions";

// Each test file signs in its own owner: files run in parallel on one database.
const owner: GithubAccount = { id: 1414, login: "embedding-owner", name: "Alex", email: "embedding-owner@example.com" };

// One dimension per concept, found by its English or German words.
const provider = useFakeEmbeddings([
  ["calm", "ruhig"],
  ["travel", "reise"],
  ["fintech", "finanz"],
]);

let app: TestApp;
let browser: TestBrowser;
let agent: Client;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
  agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  provider.failing = false;
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const libraryFile = "/src/server/library.functions.ts";
const briefing = "Ruhige Reiseseite mit viel Weißraum";

/** Runs queued embedding jobs until the queue is empty, as the job runner would. */
async function embedQueued() {
  while (await runNextEmbedding()) {
    // one job per round
  }
}

async function gallery(query: string) {
  const url = await app.serverFunctionUrl(libraryFile, "listGallery");
  return (await callServerFunction<typeof listGallery>(browser, url, { query })).map((reference) => reference.slug);
}

async function detail(slug: string) {
  return callServerFunction<typeof getReference>(browser, await app.serverFunctionUrl(libraryFile, "getReference"), { slug });
}

async function setStatus(slug: string, status: "approved" | "archived") {
  const url = await app.serverFunctionUrl(libraryFile, "setReferenceStatus");
  await callServerFunction<typeof setReferenceStatus>(browser, url, { slug, status }, "POST");
}

async function editNote(slug: string, title: string, takeNote: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ slug, title, takeNote, sourceUrl: "", attribution: "", avoidNote: "", focus: "" })) {
    form.set(name, value);
  }
  await callServerFunction<typeof updateReference>(browser, await app.serverFunctionUrl(libraryFile, "updateReference"), form);
}

async function remove(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "deleteReference");
  await callServerFunction<typeof deleteReference>(browser, url, { slug }, "POST");
}

const referenceId = async (slug: string) =>
  (await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) }))?.id ?? "";

const slugsOf = (results: unknown) => (results as { slug: string }[]).map((result) => result.slug);

/** Slugs of the references that have an embedding, of those in `slugs`. */
async function embedded(slugs: string[]) {
  const rows = await getDb()
    .select({ slug: references.slug })
    .from(referenceEmbeddings)
    .innerJoin(references, eq(references.id, referenceEmbeddings.referenceId))
    .where(inArray(references.slug, slugs));
  return rows.map((row) => row.slug).sort();
}

describe("embeddings", () => {
  it("let a German briefing find a reference by its English tags, and rank similar references", async () => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "test-key");
    const lodge = await uploadScreenshot(app, browser, "Lakeside Lodge", { takeNote: "Große Bildfläche", tags: ["hotel"] });
    const retreat = await uploadScreenshot(app, browser, "Fjord Retreat", { tags: ["travel"] });
    const ledger = await uploadScreenshot(app, browser, "Ledger Dashboard", { tags: ["fintech"] });
    // The AI analysis's English tags and texts, as the analysis job stores them.
    const id = await referenceId(lodge);
    await getDb()
      .insert(referenceAnalyses)
      .values({
        referenceId: id,
        version: 1,
        tokens: {},
        generatedBy: "analysis",
        model: "claude-opus-5-5",
        tags: { style: [], industry: ["travel"], components: [], vibe: ["calm"], colorWords: [] },
        description: { de: "Eine Landingpage mit großem Foto.", en: "A photo-led landing page." },
        layoutSummary: { de: "Foto oben.", en: "Photo on top." },
      });

    await embedQueued();

    // Voyage's document and query marks, written into the text (OpenRouter passes no input_type).
    expect(provider.inputs).toContain(
      "Represent the document for retrieval: Lakeside Lodge\nTags: hotel\nDesign: travel, calm\nTake: Große Bildfläche\nA photo-led landing page.\nEine Landingpage mit großem Foto.",
    );
    const found = await gallery(briefing);
    expect(found[0]).toBe(lodge);
    expect(found).not.toContain(ledger);
    expect(provider.inputs.at(-1)).toBe("Represent the query for retrieving supporting documents: Ruhige Reiseseite mit viel Weißraum");

    const search = await callTool(agent, "search_screens", { query: briefing, limit: 20 });
    expect(slugsOf(search.json.results)).toContain(lodge);
    expect(slugsOf(search.json.results)).not.toContain(ledger);

    const similar = await callTool(agent, "find_similar", { slug: lodge });
    expect(similar.json.method).toBe("embedding");
    expect(slugsOf(similar.json.results)[0]).toBe(retreat);
    const neighbours = (await detail(lodge)).similar;
    expect(neighbours[0]).toMatchObject({ slug: retreat, title: "Fjord Retreat" });
    // Unrelated references are no neighbours, even in a small library.
    expect(neighbours.map((reference) => reference.slug)).not.toContain(ledger);
  });

  it("are dropped when a reference is archived or deleted, and archived references never come back into results", async () => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "test-key");
    const archived = await uploadScreenshot(app, browser, "Ruhige Reise Archiv", { tags: ["calm", "travel"] });
    const deleted = await uploadScreenshot(app, browser, "Ruhige Reise Weg", { tags: ["calm", "travel"] });
    const kept = await uploadScreenshot(app, browser, "Ruhige Reise Bleibt", { tags: ["calm", "travel"] });
    await embedQueued();
    expect(await embedded([archived, deleted, kept])).toEqual([archived, deleted, kept].sort());

    await setStatus(archived, "archived");
    await remove(deleted);

    expect(await embedded([archived, deleted, kept])).toEqual([kept]);
    expect(await gallery(briefing)).toContain(kept);
    expect(await gallery(briefing)).not.toContain(archived);
    const neighbours = (await detail(kept)).similar.map((reference) => reference.slug);
    expect(neighbours).not.toContain(archived);
    expect(neighbours).not.toContain(deleted);
    const similar = await callTool(agent, "find_similar", { slug: kept, limit: 20 });
    expect(slugsOf(similar.json.results)).not.toContain(archived);

    // Back from the archive it is embedded again ...
    await setStatus(archived, "approved");
    await embedQueued();
    expect(await embedded([archived])).toEqual([archived]);
    // ... and a refresh still waiting when it is archived again stores nothing.
    await editNote(archived, "Ruhige Reise Archiv", "Neue Notiz");
    await setStatus(archived, "archived");
    await embedQueued();
    expect(await embedded([archived])).toEqual([]);
  });

  it("are backfilled for references from before the key, except archived ones", async () => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "");
    const older = await uploadScreenshot(app, browser, "Ruhige Reise Früher", { tags: ["calm", "travel"] });
    const archived = await uploadScreenshot(app, browser, "Ruhige Reise Früher Archiv", { tags: ["calm", "travel"] });
    await setStatus(archived, "archived");

    vi.stubEnv("EMBEDDINGS_API_KEY", "test-key");
    await queueMissingEmbeddings();
    await embedQueued();

    expect(await embedded([older, archived])).toEqual([older]);
    // Once embedded, a later start queues nothing for it.
    await queueMissingEmbeddings();
    const olderId = await referenceId(older);
    const waiting = await getDb().select().from(importJobs).where(eq(importJobs.referenceId, olderId));
    expect(waiting.filter((job) => job.status === "queued")).toEqual([]);
  });

  it("leave text search as it was without an embeddings key or when the endpoint fails", async () => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "");
    const sent = provider.inputs.length;
    const pension = await uploadScreenshot(app, browser, "Pension Seeufer", { tags: ["uferweg"] });
    const id = await referenceId(pension);

    expect(await gallery("seeufer uferweg")).toEqual([pension]);
    expect(await gallery(briefing)).not.toContain(pension);
    expect(slugsOf((await callTool(agent, "search_screens", { query: "seeufer" })).json.results)).toContain(pension);
    expect(await getDb().select().from(importJobs).where(eq(importJobs.referenceId, id))).toEqual([]);
    expect(provider.inputs.length).toBe(sent);

    vi.stubEnv("EMBEDDINGS_API_KEY", "test-key");
    provider.failing = true;
    expect(await gallery("seeufer uferweg")).toEqual([pension]);
    expect(slugsOf((await callTool(agent, "search_screens", { query: "seeufer" })).json.results)).toContain(pension);
  });
});
