/**
 * Colours taken from a reference in the generator's picker ("Aus Referenz"):
 * the pool serves each reference's original image for the pipette, and a
 * colour taken from the palette or by pipette makes the reference a source
 * reference of the kit it is saved in. Other test files share the database,
 * so this file's names carry its run marker.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import { serializeGeneratorSearch } from "@m3-inspo/shared/color-scheme";
import { draftFromSearch, searchFromDraft, takeFromReference } from "./lib/generator";
import { parseSearch } from "./lib/search";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { getBrandKit, saveBrandKit } from "./server/brand-kits.functions";
import type { getGeneratorPool, readImagePixel } from "./server/generator.functions";

const owner: GithubAccount = { id: 5050, login: "reference-colors-owner", name: "Alex", email: "reference-colors-owner@example.com" };
const run = randomUUID().slice(0, 8);
const project = `pipette-${run}`;

/** A teal button on the page that the measured palette missed. */
const button = { left: 700, top: 400, size: 40, hex: "#1d6b5a" };

let app: TestApp;
let browser: TestBrowser;
let slug = "";

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);

  const square = await sharp({ create: { width: button.size, height: button.size, channels: 3, background: button.hex } })
    .png()
    .toBuffer();
  const png = await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#f4efe6" } })
    .composite([{ input: square, left: button.left, top: button.top }])
    .png()
    .toBuffer();
  slug = await uploadScreenshot(app, browser, `Hotel Pipette ${run}`, { tags: [project], png });
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
      tokens: {
        palette: [
          { value: "#e56236", source: "dom" as const },
          { value: "#f4efe6", source: "dom" as const },
        ],
      },
    });
  await getDb().update(references).set({ curationStatus: "approved" }).where(eq(references.id, id));
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const fn = (file: string, name: string) => app.serverFunctionUrl(`/src/server/${file}`, name);
const loadPool = async (linked: string[] = []) =>
  callServerFunction<typeof getGeneratorPool>(browser, await fn("generator.functions.ts", "getGeneratorPool"), {
    pool: { kind: "project", tag: project },
    linked,
  });

describe("the pipette's image", () => {
  it("is the reference's original, so a pixel reads exactly as captured", async () => {
    const [reference] = (await loadPool()).references;
    expect(reference.imageUrl).toMatch(/^\/api\/assets\//);

    const response = await browser.get(reference.imageUrl);
    const image = sharp(Buffer.from(await response.arrayBuffer()));
    expect(await image.metadata()).toMatchObject({ format: "png", width: 1440, height: 900 });
    const pixel = await image
      .extract({ left: button.left + 10, top: button.top + 10, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(`#${pixel.toString("hex").slice(0, 6)}`).toBe(button.hex);
  });
});

describe("the pipette's pixel", () => {
  const read = async (input: { image: string; x: number; y: number }, caller = browser) =>
    callServerFunction<typeof readImagePixel>(caller, await fn("generator.functions.ts", "readImagePixel"), input);

  it("is read from the original on the server, exactly as captured", async () => {
    const [{ imageUrl }] = (await loadPool()).references;
    expect(await read({ image: imageUrl, x: button.left + 10, y: button.top + 10 })).toBe(button.hex);
    expect(await read({ image: imageUrl, x: 0, y: 899 })).toBe("#f4efe6");
  });

  it("is none outside the image or for an image the library does not have", async () => {
    const [{ imageUrl }] = (await loadPool()).references;
    expect(await read({ image: imageUrl, x: 1440, y: 10 })).toBeNull();
    expect(await read({ image: imageUrl, x: 10, y: 900 })).toBeNull();
    expect(await read({ image: "/api/assets/references/none/original.png", x: 0, y: 0 })).toBeNull();
    expect(await read({ image: "/etc/passwd", x: 0, y: 0 })).toBeNull();
    // A stored file that is no image (STORAGE_DIR is the test app's folder storage).
    const key = `references/${run}/broken/original.png`;
    await mkdir(dirname(join(process.env.STORAGE_DIR ?? "", key)), { recursive: true });
    await writeFile(join(process.env.STORAGE_DIR ?? "", key), "not an image");
    expect(await read({ image: `/api/assets/${key}`, x: 0, y: 0 })).toBeNull();
    await expect(read({ image: imageUrl, x: -1, y: 0 })).rejects.toThrow();
  });

  it("turns away a caller without the owner's session", async () => {
    const [{ imageUrl }] = (await loadPool()).references;
    await expect(read({ image: imageUrl, x: 0, y: 0 }, app.browser())).rejects.toThrow(/401/);
  });
});

describe("a colour taken from a reference", () => {
  it("survives the link with its origin and makes the reference a source reference of the saved kit", async () => {
    const pool = await loadPool();
    const [{ id }] = pool.references;
    let { draft } = draftFromSearch(parseSearch("?brand=e56236&neutral=8a7a72&extras=lagune:2f7d6d&seed=1"), pool);
    draft = takeFromReference(draft, "brand", "#e56236", id, pool.colors);
    draft = takeFromReference(draft, 0, button.hex, id, pool.colors);

    // Reloading: the link names the reference, the pool loads it as linked.
    const written = serializeGeneratorSearch(searchFromDraft(draft, { kind: "project", tag: project }, pool.references));
    expect(written).toContain(`brand=e56236~exact@${slug}`);
    expect(written).toContain(`extras=lagune:1d6b5a~exact@${slug}`);
    const reloaded = draftFromSearch(parseSearch(`?${written}`), await loadPool([slug])).draft;
    expect(reloaded.sources.brand.origin).toEqual({ kind: "reference", referenceId: id, measuredBy: "dom" });
    expect(reloaded.sources.extras[0]?.origin).toEqual({ kind: "reference", referenceId: id, measuredBy: "image" });

    const saved = await callServerFunction<typeof saveBrandKit>(
      browser,
      await fn("brand-kits.functions.ts", "saveBrandKit"),
      { name: `Pipette ${run}`, project: "", scheme: { sources: reloaded.sources, primary: reloaded.primary } },
      "POST",
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
    const kit = await callServerFunction<typeof getBrandKit>(browser, await fn("brand-kits.functions.ts", "getBrandKit"), {
      slug: saved.slug,
    });
    expect(kit.sourceReferences.map((source) => source.slug)).toEqual([slug]);
    expect(kit.colorScheme.sources.extras[0]?.origin).toEqual({ kind: "reference", referenceId: id, measuredBy: "image" });
  });
});
