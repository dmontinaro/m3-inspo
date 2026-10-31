/**
 * The MCP tools over the real catalogue loader: references uploaded the way
 * the owner does, analyses stored the way the analysis job stores them, and
 * an agent calling /api/mcp with a token. Each tool has a success and an
 * empty case here or in the file named next to it; list_collections and
 * get_collection in collections.test.ts. find_components and
 * find_examples_for_macrostructure get theirs with marked regions (#16).
 *
 * Other test files add references to the same database in parallel, so
 * titles and hosts carry this run's marker and assertions pick out their
 * own rows.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import type { AnalysisTokens } from "@m3-inspo/db/library-schema";
import type { Macrostructure } from "@m3-inspo/taxonomy";
import { startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Each test file signs in its own owner: files run in parallel on one database.
const owner: GithubAccount = { id: 1717, login: "tools-owner", name: "Alex", email: "tools-owner@example.com" };

/** This run's marker, in titles and hosts. */
const run = randomUUID().slice(0, 8);

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

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

/** Design values as the capture worker reads them from a page, plus the analysis's font estimate. */
const measuredTokens: AnalysisTokens = {
  palette: [
    { value: "#f7f1e8", source: "dom" },
    { value: "#1c2b33", source: "dom" },
  ],
  fonts: [{ value: "roman-serif", source: "vision", confidence: 0.7 }],
  typeRamp: [{ value: { role: "h1", family: "Canela", sizePx: 56, weight: 400, lineHeight: 1.1, letterSpacing: "0" }, source: "dom" }],
  containerWidth: { value: 1200, source: "dom" },
};

/** An estimated palette only, as the analysis stores it for a screenshot. */
const estimatedTokens: AnalysisTokens = {
  palette: [
    { value: "#7b2d8e", source: "vision", confidence: 0.8 },
    { value: "#fafafa", source: "vision", confidence: 0.6 },
  ],
};

type Analysis = { tokens: AnalysisTokens; macrostructure?: Macrostructure };

/**
 * Uploads a reference like the upload sheet and, with `analysis`, stores an
 * analysis version for it as the analysis job would. Returns the slug.
 */
async function addReference(title: string, { sourceUrl, analysis }: { sourceUrl?: string; analysis?: Analysis } = {}) {
  const slug = await uploadScreenshot(app, browser, `${title} ${run}`, { sourceUrl });
  if (analysis) {
    const reference = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
    await getDb()
      .insert(referenceAnalyses)
      .values({ referenceId: reference?.id ?? "", version: 1, mode: "light", generatedBy: "analysis", model: "claude-opus-5-5", ...analysis });
  }
  return slug;
}

/** Takes a reference back to draft, out of the agents' sight. */
const unapprove = (slug: string) => getDb().update(references).set({ curationStatus: "draft" }).where(eq(references.slug, slug));

const call = async (name: string, args: Record<string, unknown>) => (await callTool(agent, name, args)).json;

/** get_design_system answers DESIGN.md as plain text, not JSON. */
async function designMd(args: Record<string, unknown>) {
  const { content } = await agent.callTool({ name: "get_design_system", arguments: args });
  return z.array(z.object({ text: z.string() })).parse(content)[0]?.text ?? "";
}

const slugsOf = (rows: unknown) => z.array(z.object({ slug: z.string() }).loose()).parse(rows).map((row) => row.slug);

describe("get_screen", () => {
  // The unanalysed case (empty values, no provenance) is in mcp-access.test.ts.
  it("states the provenance of every value: one source for measured fields, each estimate with its confidence", async () => {
    const slug = await addReference("Seehotel Herkunft", { sourceUrl: `https://seehotel-${run}.example/`, analysis: { tokens: measuredTokens } });

    expect(await call("get_screen", { slug })).toMatchObject({
      palette: ["#f7f1e8", "#1c2b33"],
      fonts: ["roman-serif"],
      provenance: {
        palette: "dom",
        fonts: [{ value: "roman-serif", source: "vision", confidence: 0.7 }],
        typeRamp: "dom",
        containerWidth: "dom",
      },
    });
  });
});

describe("get_design_system", () => {
  it("names the source of each stored value", async () => {
    const slug = await addReference("Seehotel Designwerte", { sourceUrl: `https://seehotel-${run}.example/zimmer`, analysis: { tokens: measuredTokens } });

    const text = await designMd({ slug });

    expect(text).toMatch(/\| `#1c2b33` \| .* \| dom \|/);
    expect(text).toContain("**roman-serif** (vision, confidence 0.70)");
    expect(text).toContain("Max content width: **1200px** (dom)");
    expect(text).not.toContain("Live from the source");
  });

  it("says that nothing was measured for an unanalysed reference", async () => {
    const slug = await addReference("Ohne Analyse");

    const text = await designMd({ slug });

    expect(text).toContain("None measured or estimated for this reference yet");
    expect(text).not.toContain("## Colors");
  });

  it("reads live only on request, and then only through the URL guard", async () => {
    const inward = await addReference("Interne Adresse", { sourceUrl: "http://127.0.0.1/", analysis: { tokens: estimatedTokens } });
    const upload = await addReference("Nur Bild");

    expect(await designMd({ slug: inward })).not.toContain("Live from the source");
    expect(await designMd({ slug: inward, live: true })).toContain(
      "_Not available: Blocked URL: the host points to a private or reserved address._",
    );
    expect(await designMd({ slug: upload, live: true })).toContain(
      "_Not available: this reference is an uploaded image without a source URL._",
    );
  });
});

describe("compare", () => {
  it("lays references side by side with their provenance, leaving unmeasured values empty instead of zero", async () => {
    const measured = await addReference("Vergleich gemessen", { sourceUrl: `https://vergleich-${run}.example/`, analysis: { tokens: measuredTokens } });
    const bare = await addReference("Vergleich leer");

    const { sites, shared } = z
      .object({ sites: z.array(z.record(z.string(), z.unknown())), shared: z.record(z.string(), z.unknown()) })
      .parse(await call("compare", { slugs: [measured, bare] }));

    expect(sites[0]).toMatchObject({ slug: measured, typeScaleSteps: 1, containerWidth: 1200, provenance: { palette: "dom" } });
    expect(sites[1]).toMatchObject({ slug: bare, palette: [], fonts: [], typeScaleSteps: null, containerWidth: null });
    expect(sites[1]).not.toHaveProperty("provenance");
    expect(shared.sameRegister).toBeNull();
  });
});

describe("find_by_color", () => {
  // The measured case is in import-jobs.test.ts.
  it("says when the matching colour is only an estimate", async () => {
    const slug = await addReference("Violett geschätzt", { analysis: { tokens: estimatedTokens } });

    const { results } = z.object({ results: z.array(z.record(z.string(), z.unknown())) }).parse(
      await call("find_by_color", { hex: "#7b2d8e", tolerance: 0.02, limit: 40 }),
    );

    expect(results.find((row) => row.slug === slug)?.match).toEqual({
      hex: "#7b2d8e",
      distance: 0,
      source: "vision",
      confidence: 0.8,
    });
  });

  it("finds nothing for a colour no reference carries", async () => {
    expect(await call("find_by_color", { hex: "#00ff0f", tolerance: 0.02 })).toMatchObject({ count: 0, results: [] });
  });
});

describe("get_site_pages", () => {
  it("groups the pages of one host, with or without www., landing page first", async () => {
    const host = `pension-${run}.example`;
    const pricing = await addReference("Pension Preise", { sourceUrl: `https://${host}/preise` });
    const about = await addReference("Pension Über uns", { sourceUrl: `https://${host}/de/ueber-uns` });
    const landing = await addReference("Pension Startseite", { sourceUrl: `https://www.${host}/` });
    await addReference("Andere Pension", { sourceUrl: `https://andere-${run}.example/` });

    const site = await call("get_site_pages", { siteSlug: about });

    expect(site).toMatchObject({ siteSlug: landing, host, pageCount: 3, sequence: "landing → pricing → about" });
    expect(slugsOf(site.pages)).toEqual([landing, pricing, about]);
    const directory = z.object({ sites: z.array(z.object({ host: z.string() }).loose()) }).parse(await call("get_site_pages", { limit: 50 }));
    expect(directory.sites.find((entry) => entry.host === host)).toEqual({ siteSlug: landing, host, title: `Pension Startseite ${run}`, pageCount: 3 });
  });

  it("shows a single page when the library holds no other page of its site", async () => {
    const lonely = await addReference("Einzelseite", { sourceUrl: `https://einzel-${run}.example/` });
    const upload = await addReference("Einzelbild");

    expect(await call("get_site_pages", { siteSlug: lonely })).toMatchObject({
      pageCount: 1,
      tip: "Only this page of the website is in the library.",
    });
    expect(await call("get_site_pages", { siteSlug: upload })).toMatchObject({
      pageCount: 1,
      tip: "An uploaded image without a source URL: a site of its own with this one page.",
    });
  });
});

describe("code templates", () => {
  // Maintained templates have no table yet; their success case runs on fixtures in packages/mcp.
  it("are reported as not maintained, with nothing from the original Inspo", async () => {
    expect(await call("find_reference_components", { type: "hero" })).toEqual({
      count: 0,
      note: expect.stringMatching(/^No code templates are maintained in this library yet/),
      components: [],
    });
    expect(await call("get_reference_jsx", { type: "hero", id: "marquee" })).toEqual({
      error: expect.stringMatching(/^No code templates are maintained in this library yet/),
      validIds: [],
    });
  });
});

describe("recommend", () => {
  it("returns the owner's reference with its notes for a matching brief", async () => {
    const slug = await uploadScreenshot(app, browser, `Bergchalet Buchung ${run}`, { takeNote: "Große Buchungsleiste", tags: [`projekt-${run}`] });

    const found = await call("recommend", { brief: `Bergchalet ${run}`, project: `projekt-${run}` });

    expect(found.results).toMatchObject([{ slug, taste: { take: "Große Buchungsleiste", tags: [`projekt-${run}`] } }]);
  });

  it("reports the gap instead of loosening a project nobody tagged", async () => {
    const found = await call("recommend", { brief: "Bergchalet", project: `leer-${run}` });

    expect(found).toMatchObject({ count: 0, results: [], gap: expect.stringMatching(/^Found 0 references .* not loosened/) });
  });
});

describe("search_screens", () => {
  // Matches are covered in tags.test.ts, embeddings.test.ts and collections.test.ts.
  it("says so when nothing matches", async () => {
    expect(await call("search_screens", { query: `nichts-${run}`, project: `leer-${run}` })).toMatchObject({
      count: 0,
      results: [],
      tip: "No matches. Try fewer filters or a broader query.",
    });
  });
});

describe("get_filters", () => {
  it("counts only approved references per macrostructure", async () => {
    const coverage = async () =>
      z.object({ macrostructureCoverage: z.object({ specimen: z.number() }).loose() }).parse(await call("get_filters", {}))
        .macrostructureCoverage.specimen;
    const before = await coverage();
    const slug = await addReference("Specimen Seite", { analysis: { tokens: {}, macrostructure: "specimen" } });

    expect(await coverage()).toBe(before + 1);
    await unapprove(slug);
    expect(await coverage()).toBe(before);
  });
});

describe("find_similar", () => {
  // Ranking is covered in embeddings.test.ts.
  it("does not know a draft", async () => {
    const slug = await addReference("Ähnlich Entwurf");
    await unapprove(slug);

    expect((await call("find_similar", { slug })).error).toBe(`No screen with slug '${slug}'.`);
  });
});
