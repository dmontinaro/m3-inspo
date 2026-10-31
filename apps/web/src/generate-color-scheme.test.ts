/**
 * The pool and generate_color_scheme over the real library: references
 * uploaded the way the owner does, analyses stored the way the analysis
 * job stores them, and an agent calling /api/mcp with a token. Missing
 * colours are rolled from the pool's measured palettes (#45); drafts and
 * archived references never enter it.
 *
 * Other test files add references to the same database in parallel, so
 * this file's references carry its run marker in titles and the project
 * tag, and pool assertions stick to their own rows.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { selectPool } from "@m3-inspo/db";
import { loadCatalogue } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import { collectionReferences, collections, referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import type { AnalysisTokens, CurationStatus } from "@m3-inspo/db/library-schema";
import { parseGeneratorSearch } from "@m3-inspo/shared/color-scheme";
import { startTestApp, testOrigin } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const owner: GithubAccount = { id: 5454, login: "scheme-owner", name: "Alex", email: "scheme-owner@example.com" };

/** This run's marker, in titles and the project tag. */
const run = randomUUID().slice(0, 8);
const project = `harbor-${run}`;

let app: TestApp;
let browser: TestBrowser;
let agent: Client;

type Fixture = { slug: string; id: string };
/** The pool fixtures: slug and id of each reference, set in beforeAll. */
let refs: { hotel: Fixture; saas: Fixture; draft: Fixture; archived: Fixture };
let collection = "";

/**
 * Uploads a reference with `tags`, stores an analysis with this palette and
 * sets its curation status. Returns slug and id.
 */
async function addReference(title: string, palette: AnalysisTokens["palette"], status: CurationStatus, tags: string[] = []) {
  const slug = await uploadScreenshot(app, browser, `${title} ${run}`, { tags });
  const row = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
  const id = row?.id ?? "";
  await getDb()
    .insert(referenceAnalyses)
    .values({ referenceId: id, version: 1, mode: "light", generatedBy: "analysis", model: "claude-opus-5-5", tokens: { palette } });
  await getDb().update(references).set({ curationStatus: status }).where(eq(references.id, id));
  return { slug, id };
}

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
  agent = await connectMcp(app, (await createMcpToken(app, browser)).token);

  const dom = (value: string) => ({ value, source: "dom" as const });
  const vision = (value: string) => ({ value, source: "vision" as const, confidence: 0.8 });
  refs = {
    hotel: await addReference("Hotel Pool", ["#ffffff", "#e56236", "#8a7a72"].map(dom), "approved", [project]),
    saas: await addReference("SaaS Pool", ["#6b4eff", "#1c2b33"].map(vision), "approved"),
    draft: await addReference("Entwurf Pool", ["#2f7d6d", "#f7f1e8"].map(dom), "draft", [project]),
    archived: await addReference("Archiv Pool", ["#d9822b", "#3f3f46"].map(dom), "archived", [project]),
  };

  collection = `pool-${run}`;
  const [created] = await getDb().insert(collections).values({ slug: collection, name: `Pool ${run}` }).returning({ id: collections.id });
  await getDb()
    .insert(collectionReferences)
    .values([refs.draft, refs.saas].map((ref, position) => ({ collectionId: created.id, referenceId: ref.id, position })));
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("the pool", () => {
  const pool = async (selector: Parameters<typeof selectPool>[1]) => selectPool(await loadCatalogue(getDb()), selector);
  const own = (referenceId: string) => Object.values(refs).some((ref) => ref.id === referenceId);

  it("holds the palette colours of approved references with reference and measurement, for a project or named slugs", async () => {
    expect((await pool({ kind: "project", tag: project })).colors).toEqual([
      { hex: "#ffffff", measuredBy: "dom", referenceId: refs.hotel.id },
      { hex: "#e56236", measuredBy: "dom", referenceId: refs.hotel.id },
      { hex: "#8a7a72", measuredBy: "dom", referenceId: refs.hotel.id },
    ]);
    const named = await pool({ kind: "references", slugs: [refs.saas.slug, refs.hotel.slug] });
    expect(named.references.map((reference) => reference.slug)).toEqual([refs.saas.slug, refs.hotel.slug]);
    expect(named.colors.slice(0, 2)).toEqual([
      { hex: "#6b4eff", measuredBy: "vision", referenceId: refs.saas.id },
      { hex: "#1c2b33", measuredBy: "vision", referenceId: refs.saas.id },
    ]);
    // A slug named twice counts once.
    expect((await pool({ kind: "references", slugs: [refs.saas.slug, refs.saas.slug] })).colors).toHaveLength(2);
  });

  it("never takes drafts or archived references, not by slug, collection or project, and not in `all`", async () => {
    expect((await pool({ kind: "references", slugs: [refs.draft.slug, refs.archived.slug] })).colors).toEqual([]);
    expect((await pool({ kind: "collection", slug: collection })).references.map((reference) => reference.slug)).toEqual([refs.saas.slug]);
    const all = (await pool({ kind: "all" })).colors.filter((color) => own(color.referenceId));
    expect(new Set(all.map((color) => color.referenceId))).toEqual(new Set([refs.hotel.id, refs.saas.id]));
  });
});

const source = z.object({ hex: z.string(), lock: z.enum(["open", "hue", "exact"]), origin: z.object({ kind: z.string() }).loose() });

const schemeResult = z.object({
  primary: z.enum(["vivid", "hold"]),
  seed: z.number(),
  sources: z.object({ brand: source, neutral: source, extras: z.array(source.extend({ name: z.string() })) }),
  roles: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      oklch: z.string(),
      derivation: z.string(),
      contrast: z.object({ against: z.string(), ratio: z.number(), min: z.number() }).optional(),
    }),
  ),
  scales: z.array(z.object({ name: z.string(), anchorStep: z.number(), steps: z.record(z.string(), z.string()) })),
  warnings: z.array(z.object({ role: z.string(), message: z.string() })),
  css: z.string(),
  generatorUrl: z.string(),
  tip: z.string(),
});

const generate = async (args: Record<string, unknown>) => schemeResult.parse((await callTool(agent, "generate_color_scheme", args)).json);

/** A project tag no reference carries: an empty pool. */
const emptyProject = `ohne-referenzen-${run}`;

describe("generate_color_scheme", () => {
  it("keeps a hue-locked Harbor orange, darkens primary for white text and rolls the neutral from the project", async () => {
    const scheme = await generate({ brand: { hex: "#e56236", lock: "hue" }, project, seed: 7 });

    const primary = scheme.roles.find((role) => role.name === "primary");
    expect(primary).toMatchObject({ hex: "#d54400", derivation: "Marke, abgedunkelt", oklch: expect.stringMatching(/^oklch\(/) });
    expect(scheme.roles.find((role) => role.name === "primary-foreground")).toMatchObject({
      hex: "#ffffff",
      contrast: { against: "primary", min: 4.5, ratio: expect.any(Number) },
    });
    expect(scheme.roles).toHaveLength(11);

    const brand = scheme.scales.find((scale) => scale.name === "brand");
    expect(brand?.steps[String(brand.anchorStep)]).toBe("#e56236");
    expect(scheme.scales.map((scale) => scale.name)).toEqual(["brand", "neutral", "danger"]);

    expect(scheme.sources.brand).toEqual({ hex: "#e56236", lock: "hue", origin: { kind: "manual" } });
    expect(scheme.sources.neutral).toEqual({
      hex: "#8a7a72",
      lock: "open",
      origin: { kind: "reference", slug: refs.hotel.slug, title: `Hotel Pool ${run}`, measuredBy: "dom", seed: 7 },
    });
    expect(scheme.seed).toBe(7);
    expect(scheme.tip).toMatch(/get_screen/);
    expect(scheme.css).toMatch(/^:root \{[\s\S]*--primary: oklch\([\s\S]*@theme inline \{/);
  });

  it("rolls from the references named and links them in a URL the shared parser reads back", async () => {
    const scheme = await generate({ references: [refs.saas.slug], seed: 3 });
    const fromSaas = { kind: "reference", slug: refs.saas.slug, title: `SaaS Pool ${run}`, measuredBy: "vision", seed: 3 };
    expect(scheme.sources.brand).toEqual({ hex: "#6b4eff", lock: "open", origin: fromSaas });
    expect(scheme.sources.neutral).toEqual({ hex: "#1c2b33", lock: "open", origin: fromSaas });

    const { state, skipped } = parseGeneratorSearch(Object.fromEntries(new URL(scheme.generatorUrl).searchParams));
    expect(skipped).toEqual([]);
    expect(state).toMatchObject({
      brand: { hex: "#6b4eff", lock: "open", reference: refs.saas.slug },
      neutral: { hex: "#1c2b33", lock: "open", reference: refs.saas.slug },
      seed: 3,
      pool: { kind: "references", slugs: [refs.saas.slug] },
    });
  });

  it("leaves drafts and archived references out of the pool, also when named, and then rolls freely", async () => {
    const scheme = await generate({ references: [refs.draft.slug, refs.archived.slug], seed: 5 });
    expect(scheme.sources.brand.origin).toEqual({ kind: "rolled", seed: 5 });
    expect(scheme.sources.neutral.origin).toEqual({ kind: "rolled", seed: 5 });
    expect(scheme.tip).toContain(`No approved reference for: ${refs.draft.slug}, ${refs.archived.slug}`);
    expect(scheme.tip).toMatch(/without a reference/);
  });

  it("links to the generator with a URL the shared parser reads back without loss", async () => {
    const scheme = await generate({
      brand: "#6b4eff",
      neutral: { hex: "#8a7a72", lock: "hue" },
      extras: ["#2f7d6d", { hex: "#c8a97e", lock: "hue", name: "sand" }],
      primary: "hold",
    });
    const url = new URL(scheme.generatorUrl);
    expect(url.origin + url.pathname).toBe(`${testOrigin}/generator`);

    const { state, skipped } = parseGeneratorSearch(Object.fromEntries(url.searchParams));
    expect(skipped).toEqual([]);
    expect(state).toEqual({
      brand: { hex: "#6b4eff", lock: "exact" },
      neutral: { hex: "#8a7a72", lock: "hue" },
      extras: [
        { name: "teal", hex: "#2f7d6d", lock: "exact" },
        { name: "sand", hex: "#c8a97e", lock: "hue" },
      ],
      primary: "hold",
      seed: scheme.seed,
      pool: { kind: "all" },
    });
  });

  it("rolls the same colours again for the same seed and pool", async () => {
    const fromProject = await generate({ project, seed: 123 });
    expect(await generate({ project, seed: 123 })).toEqual(fromProject);

    const free = await generate({ project: emptyProject, seed: 123 });
    expect((await generate({ project: emptyProject, seed: 123 })).sources).toEqual(free.sources);
    expect(free.sources.brand.origin).toEqual({ kind: "rolled", seed: 123 });
  });

  it("rejects a reserved name for an extra colour and an unreadable hex", async () => {
    const reserved = await callTool(agent, "generate_color_scheme", { brand: "#e56236", extras: [{ hex: "#2f7d6d", name: "primary" }] });
    expect(reserved.json.error).toMatch(/"primary".*reserved/);
    const unreadable = await callTool(agent, "generate_color_scheme", { brand: "orange" });
    expect(unreadable.json.error).toMatch(/brand.*"orange"/);
  });
});
