/**
 * Brand Kits over MCP (#49): the owner saves and approves kits through the
 * kit pages' server functions, an agent reads them from /api/mcp with a
 * token. Only approved kits show, at once; the answer comes from the stored
 * snapshot with the owner's notes verbatim and the source references the
 * agent may see.
 *
 * Other test files share the database (and approve kits of their own), so
 * names and project tags carry this file's run marker and list assertions
 * stick to its own kits.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { brandKits, references } from "@m3-inspo/db/library-schema";
import { exportCss } from "@m3-inspo/shared/color-scheme";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { saveBrandKit, setBrandKitStatus, updateBrandKitNotes, updateBrandKitDesignBriefing } from "./server/brand-kits.functions";
import type { ColorSchemeInput } from "./server/brand-kits.server";
import type { deleteReference, setReferenceStatus } from "./server/library.functions";

const owner: GithubAccount = { id: 4949, login: "kit-mcp-owner", name: "Alex", email: "kit-mcp-owner@example.com" };

/** This run's marker, in titles, kit names and project tags. */
const run = randomUUID().slice(0, 8);
/** A project with an approved kit, and one whose only kit is a draft. */
const project = `harbor-${run}`;
const draftProject = `entwurf-${run}`;

/** The owner's notes, with line breaks and quotes that must arrive as written. */
const notes = 'Orange nur für Aktionen, nie für Fließtext.\n\n"Teal" bleibt den Diagrammen vorbehalten.';

let app: TestApp;
let browser: TestBrowser;
let agent: Client;

type Fixture = { slug: string; id: string; title: string };
/** The source references: one stays approved, one is archived, one deleted. */
let sources: { kept: Fixture; archived: Fixture; deleted: Fixture };
/** The kits: approved for `project`, a draft for `draftProject`, an archived one. */
let kits: { approved: string; draft: string; archived: string };

const file = "/src/server/brand-kits.functions.ts";
const libraryFile = "/src/server/library.functions.ts";

async function addReference(title: string): Promise<Fixture> {
  const fullTitle = `${title} ${run}`;
  const slug = await uploadScreenshot(app, browser, fullTitle, { tags: [project] });
  const row = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
  return { slug, id: row?.id ?? "", title: fullTitle };
}

/** Saves a kit as a draft and returns its slug. */
async function saveKit(name: string, scheme: ColorSchemeInput, kitProject = "") {
  const result = await callServerFunction<typeof saveBrandKit>(
    browser,
    await app.serverFunctionUrl(file, "saveBrandKit"),
    { name: `${name} ${run}`, project: kitProject, scheme },
    "POST",
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.slug;
}

const setStatus = async (slug: string, status: "draft" | "approved" | "archived") =>
  callServerFunction<typeof setBrandKitStatus>(browser, await app.serverFunctionUrl(file, "setBrandKitStatus"), { slug, status }, "POST");

/** Harbor: brand from the kept reference, neutral from the archived one, an extra from the deleted one. */
const harbor = (): ColorSchemeInput => ({
  sources: {
    brand: { hex: "#e56236", lock: "hue", origin: { kind: "reference", referenceId: sources.kept.id, measuredBy: "dom" } },
    neutral: { hex: "#8a7a72", lock: "open", origin: { kind: "reference", referenceId: sources.archived.id, measuredBy: "vision", seed: 7 } },
    extras: [{ name: "teal", hex: "#2f7d6d", lock: "exact", origin: { kind: "reference", referenceId: sources.deleted.id, measuredBy: "image" } }],
  },
  primary: "vivid",
});

const violet = (): ColorSchemeInput => ({
  sources: {
    brand: { hex: "#6b4eff", lock: "exact", origin: { kind: "manual" } },
    neutral: { hex: "#71717a", lock: "open", origin: { kind: "rolled", seed: 9 } },
    extras: [],
  },
  primary: "hold",
});

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
  agent = await connectMcp(app, (await createMcpToken(app, browser)).token);

  sources = { kept: await addReference("Quelle Hotel"), archived: await addReference("Quelle Archiv"), deleted: await addReference("Quelle Gelöscht") };
  kits = {
    approved: await saveKit("Harbor", harbor(), project),
    draft: await saveKit("Violett", violet(), draftProject),
    archived: await saveKit("Archiv", violet()),
  };
  await setStatus(kits.approved, "approved");
  await setStatus(kits.archived, "archived");
  await callServerFunction<typeof updateBrandKitNotes>(browser, await app.serverFunctionUrl(file, "updateBrandKitNotes"), { slug: kits.approved, notes }, "POST");

  await callServerFunction<typeof setReferenceStatus>(
    browser,
    await app.serverFunctionUrl(libraryFile, "setReferenceStatus"),
    { slug: sources.archived.slug, status: "archived" },
    "POST",
  );
  await callServerFunction<typeof deleteReference>(browser, await app.serverFunctionUrl(libraryFile, "deleteReference"), { slug: sources.deleted.slug }, "POST");
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const listed = z.object({
  count: z.number(),
  brandKits: z.array(z.object({ slug: z.string(), name: z.string(), project: z.string().nullable(), brand: z.string(), primary: z.string() })),
  tip: z.string(),
});

const list = async (args: Record<string, unknown> = {}) => listed.parse((await callTool(agent, "list_brand_kits", args)).json);
/** This file's kits among the listed ones. */
const ownSlugs = (result: z.infer<typeof listed>) => result.brandKits.map((kit) => kit.slug).filter((slug) => Object.values(kits).includes(slug));

describe("list_brand_kits", () => {
  it("lists only approved kits, compactly, and narrows to a project", async () => {
    const all = await list();
    expect(ownSlugs(all)).toEqual([kits.approved]);
    expect(all.brandKits.find((kit) => kit.slug === kits.approved)).toEqual({
      slug: kits.approved,
      name: `Harbor ${run}`,
      project,
      brand: "#e56236",
      primary: "#d54400",
    });

    expect((await list({ project: ` ${project.toUpperCase()} ` })).brandKits.map((kit) => kit.slug)).toEqual([kits.approved]);
    const onlyDraft = await list({ project: draftProject });
    expect(onlyDraft.brandKits).toEqual([]);
    expect(JSON.stringify(onlyDraft)).not.toContain(kits.draft);
  });

  it("shows an approval on the next call and drops the kit once it is archived again", async () => {
    const slug = await saveKit("Sofort", violet());
    expect(ownSlugs(await list())).not.toContain(slug);

    await setStatus(slug, "approved");
    expect((await list()).brandKits.map((kit) => kit.slug)).toContain(slug);
    expect((await callTool(agent, "get_brand_kit", { slug })).json).toMatchObject({ slug, name: `Sofort ${run}` });

    await setStatus(slug, "archived");
    expect((await list()).brandKits.map((kit) => kit.slug)).not.toContain(slug);
    expect((await callTool(agent, "get_brand_kit", { slug })).json.error).toMatch(/No approved Brand Kit/);
  });
});

const source = z.object({ hex: z.string(), lock: z.string(), name: z.string().optional(), origin: z.record(z.string(), z.unknown()) });

const kitResult = z.object({
  slug: z.string(),
  name: z.string(),
  project: z.string().nullable(),
  notes: z.string().nullable(),
  primary: z.enum(["vivid", "hold"]),
  sources: z.object({ brand: source, neutral: source, extras: z.array(source) }),
  roles: z.array(z.object({ name: z.string(), hex: z.string(), oklch: z.string(), derivation: z.string(), contrast: z.object({ against: z.string(), ratio: z.number(), min: z.number() }).optional() })),
  scales: z.array(z.object({ name: z.string(), anchorStep: z.number(), steps: z.record(z.string(), z.string()) })),
  warnings: z.array(z.object({ role: z.string(), message: z.string() })),
  css: z.string(),
  tip: z.string(),
});

describe("get_brand_kit", () => {
  it("answers the approved kit of a project from its stored snapshot, with the notes verbatim in their own field", async () => {
    const { text, json } = await (async () => {
      const result = await callTool(agent, "get_brand_kit", { project });
      return { json: kitResult.parse(result.json), text: JSON.stringify(result.json) };
    })();
    const stored = await getDb().query.brandKits.findFirst({ columns: { colorScheme: true }, where: eq(brandKits.slug, kits.approved) });
    const snapshot = stored!.colorScheme.snapshot;

    expect(json).toMatchObject({ slug: kits.approved, name: `Harbor ${run}`, project, notes, primary: "vivid" });
    expect(json.css).toBe(exportCss(snapshot));
    expect(json.roles).toHaveLength(11);
    expect(json.roles.find((role) => role.name === "primary")).toEqual({
      name: "primary",
      hex: snapshot.roles.primary.hex,
      oklch: expect.stringMatching(/^oklch\(/),
      derivation: snapshot.roles.primary.derivation,
    });
    expect(json.roles.find((role) => role.name === "primary-foreground")?.contrast).toEqual(snapshot.roles["primary-foreground"].contrast);
    expect(json.scales).toEqual(snapshot.scales);
    expect(json.warnings).toEqual(snapshot.warnings);
    expect(json.tip).toMatch(/scale names are not stable/);
    // No images: nothing points into the image route.
    expect(text).not.toContain("/api/assets/");

    expect((await callTool(agent, "get_brand_kit", { slug: kits.approved })).json).toEqual((await callTool(agent, "get_brand_kit", { project })).json);
  });

  it("delivers the brand's Markdown verbatim on the next call and keeps draft briefings private", async () => {
    const designBriefing = "# Harbor\n\n## Muster\n\n- Erledigte Anfragen einklappen.\n";
    const update = async (slug: string, text: string) =>
      callServerFunction<typeof updateBrandKitDesignBriefing>(browser, await app.serverFunctionUrl(file, "updateBrandKitDesignBriefing"), { slug, designBriefing: text }, "POST");
    await update(kits.approved, designBriefing);
    await update(kits.draft, "Private draft briefing");
    expect((await callTool(agent, "get_brand_kit", { project })).json.designBriefing).toBe(designBriefing);
    expect((await callTool(agent, "get_brand_kit", { slug: kits.approved })).json.designBriefing).toBe(designBriefing);
    expect(JSON.stringify((await callTool(agent, "get_brand_kit", { project: draftProject })).json)).not.toContain("Private draft briefing");
    await update(kits.approved, "");
    expect((await callTool(agent, "get_brand_kit", { project })).json.designBriefing).toBeNull();
  });

  it("names approved source references, leaves archived ones out and marks deleted ones", async () => {
    const result = await callTool(agent, "get_brand_kit", { slug: kits.approved });
    const { sources: answered } = kitResult.parse(result.json);

    expect(answered.brand.origin).toEqual({ kind: "reference", measuredBy: "dom", slug: sources.kept.slug, title: sources.kept.title });
    expect(answered.neutral.origin).toEqual({ kind: "reference", measuredBy: "vision", seed: 7 });
    expect(answered.extras[0].origin).toEqual({ kind: "reference", measuredBy: "image", deleted: true });
    const text = JSON.stringify(result.json);
    for (const hidden of [sources.archived.slug, sources.archived.title, sources.archived.id]) expect(text).not.toContain(hidden);
  });

  it("says clearly when a project has no approved kit, without giving its draft away", async () => {
    const { json } = await callTool(agent, "get_brand_kit", { project: draftProject });

    expect(json.error).toBe(`Project '${draftProject}' has no approved Brand Kit.`);
    const text = JSON.stringify(json);
    for (const hidden of [kits.draft, `Violett ${run}`, "#6b4eff"]) expect(text).not.toContain(hidden);
    expect((await callTool(agent, "get_brand_kit", { slug: kits.draft })).json.error).toBe(`No approved Brand Kit with slug '${kits.draft}'.`);
  });
});

describe("the brandKit hint on recommend and search_screens", () => {
  const hint = /take colours from the Brand Kit \(get_brand_kit\), not from the references' palettes/;

  it("points to the approved kit of the project", async () => {
    for (const [tool, args] of [
      ["recommend", { brief: "Hotel Quelle", project }],
      ["search_screens", { query: "", project }],
    ] as const) {
      const { json } = await callTool(agent, tool, args);
      expect(json.brandKit, tool).toEqual({ slug: kits.approved, name: `Harbor ${run}` });
      expect(json.tip, tool).toMatch(hint);
    }
  });

  it("is absent for a project whose kit is only a draft, and without a project", async () => {
    for (const [tool, args] of [
      ["recommend", { brief: "Hotel Quelle", project: draftProject }],
      ["search_screens", { query: "", project: draftProject }],
      ["recommend", { brief: "Hotel Quelle" }],
      ["search_screens", { query: "Quelle" }],
    ] as const) {
      const { json } = await callTool(agent, tool, args);
      expect(json.brandKit, tool).toBeUndefined();
      expect(JSON.stringify(json), tool).not.toMatch(hint);
    }
  });
});
