/**
 * The generator page over the real library: the pool server function it
 * loads, and how /generator answers links, broken ones included. Other test
 * files add references to the same database in parallel, so this file's
 * references carry its run marker in titles and the project tag.
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
import type { getGeneratorPool } from "./server/generator.functions";

const owner: GithubAccount = { id: 4646, login: "generator-owner", name: "Alex", email: "generator-owner@example.com" };
const run = randomUUID().slice(0, 8);
const project = `harbor-${run}`;

let app: TestApp;
let browser: TestBrowser;
let hotel = "";
let saas = "";

/** Uploads an approved reference with this DOM-measured palette and returns its slug. */
async function addReference(title: string, palette: string[], tags: string[] = []) {
  const slug = await uploadScreenshot(app, browser, `${title} ${run}`, { tags });
  const row = await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) });
  const id = row?.id ?? "";
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
  await getDb().update(references).set({ curationStatus: "approved" }).where(eq(references.id, id));
  return slug;
}

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
  hotel = await addReference("Hotel Generator", ["#e56236", "#8a7a72"], [project]);
  saas = await addReference("SaaS Generator", ["#6b4eff"]);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const poolUrl = () => app.serverFunctionUrl("/src/server/generator.functions.ts", "getGeneratorPool");

describe("the generator's pool", () => {
  it("gives the owner the project's references and colours, the references the URL names and the menu", async () => {
    const pool = await callServerFunction<typeof getGeneratorPool>(browser, await poolUrl(), {
      pool: { kind: "project", tag: project },
      linked: [saas, "gone"],
    });

    expect(pool.references.map((reference) => reference.slug)).toEqual([hotel]);
    expect(pool.references[0]).toMatchObject({ title: `Hotel Generator ${run}`, thumbUrl: expect.stringMatching(/^\/api\/assets\//) });
    expect(pool.colors.map((color) => color.hex)).toEqual(["#e56236", "#8a7a72"]);
    // Named by a colour in the URL, outside the pool: known with its measured colours.
    expect(pool.linked.references.map((reference) => reference.slug)).toEqual([saas]);
    expect(pool.linked.colors).toEqual([{ hex: "#6b4eff", measuredBy: "dom", referenceId: pool.linked.references[0]?.id }]);
    expect(pool.projects).toContain(project);
  });

  it("turns away a caller without the owner's session", async () => {
    await expect(
      callServerFunction<typeof getGeneratorPool>(app.browser(), await poolUrl(), { pool: { kind: "all" }, linked: [] }),
    ).rejects.toThrow(/401/);
  });
});

describe("/generator", () => {
  it("opens a broken link and says what it skipped", async () => {
    const response = await browser.get(`/generator?brand=zz9&neutral=8a7a72@gone-ref&pool=collection:weg-${run}&seed=5`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Marke „zz9“ nicht lesbar");
    expect(html).toContain("Referenz „gone-ref“ unbekannt");
    expect(html).toContain(`Pool „collection:weg-${run}“ unbekannt`);
  });

  it("gives a link without a seed one, so the start roll is the same on server and client", async () => {
    const response = await browser.get(`/generator?brand=e56236~hue&pool=project:${project}`);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/^\/generator\?brand=e56236~hue&pool=project:harbor-[0-9a-f]+&seed=\d+$/);
  });
});
