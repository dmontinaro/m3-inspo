/**
 * Marking regions through the server functions the detail view calls,
 * checked where it matters: the stored crop, the image route and what a
 * coding agent gets from `find_components`.
 */

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { referenceRegions } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp, testOrigin } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { deleteReference, getReference } from "./server/library.functions";
import type { addRegion, deleteRegion, updateRegion } from "./server/regions.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 9191, login: "regions-owner", name: "Alex", email: "regions-owner@example.com" };

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id), INSPO_BASE_URL: testOrigin });
  browser = app.browser();
  browser.setCookie("PARAGLIDE_LOCALE", "de");
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const regionsFile = "/src/server/regions.functions.ts";
const libraryFile = "/src/server/library.functions.ts";

/** A 1440 × 900 page with a dark green navigation bar across the top 80 px. */
const pageWithNav = () =>
  sharp({ create: { width: 1440, height: 900, channels: 3, background: "#f4efe6" } })
    .composite([{ input: Buffer.from('<svg width="1440" height="80"><rect width="100%" height="100%" fill="#1d3b34"/></svg>'), top: 0, left: 0 }])
    .png()
    .toBuffer();

/** Uploads the page and returns its slug and the id of its capture. */
async function uploadPage(title: string) {
  const slug = await uploadScreenshot(app, browser, title, { png: await pageWithNav() });
  const url = await app.serverFunctionUrl(libraryFile, "getReference");
  const reference = await callServerFunction<typeof getReference>(browser, url, { slug });
  return { slug, captureId: reference.captures[0].id };
}

type NewRegion = { captureId: string; x: number; y: number; width: number; height: number; componentType: string; note: string };

async function mark(slug: string, region: NewRegion) {
  const url = await app.serverFunctionUrl(regionsFile, "addRegion");
  return callServerFunction<typeof addRegion>(browser, url, { slug, ...region }, "POST");
}

/** Marks a region that must be accepted and returns its stored row. */
async function markOk(slug: string, region: NewRegion) {
  const result = await mark(slug, region);
  if (!result.ok) throw new Error(result.reason);
  const [row] = await getDb().select().from(referenceRegions).where(eq(referenceRegions.id, result.id));
  return row;
}

/** The stored image at `key` as the owner's browser gets it, or its status when there is none. */
async function asset(key: string) {
  const response = await browser.get(`/api/assets/${key}`);
  return response.ok ? { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) } : { status: response.status };
}

const components = z.array(z.object({ slug: z.string(), imageUrl: z.string(), ownerNote: z.string().nullable().optional() }));

async function findComponents(type: string) {
  const agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
  const { json, images } = await callTool(agent, "find_components", { type });
  return { json, images, components: components.parse(json.components) };
}

describe("a marked region", () => {
  it("is found by find_components with its crop and the owner's note", async () => {
    const { slug, captureId } = await uploadPage("Hotel Seeblick Startseite");
    await markOk(slug, {
      captureId,
      x: 0,
      y: 0,
      width: 1440,
      height: 80,
      componentType: "nav",
      note: "Logo links, Buchen-Button rechts",
    });

    const { components: found, images } = await findComponents("nav");

    const index = found.findIndex((component) => component.slug === slug);
    expect(found[index]).toEqual(
      expect.objectContaining({
        ownerNote: "Logo links, Buchen-Button rechts",
        imageUrl: expect.stringMatching(new RegExp(`^${testOrigin}/api/assets/references/.+/regions/.+/crop\\.webp$`)),
      }),
    );
    // The inline image is the crop's small version, not the page thumbnail.
    const { format, width, height } = await sharp(Buffer.from(images[index]?.data ?? "", "base64")).metadata();
    expect({ format, width, height }).toEqual({ format: "webp", width: 640, height: 36 });
  });

  it("is stored as a crop of exactly the rectangle", async () => {
    const { slug, captureId } = await uploadPage("Pension am See");
    const region = await markOk(slug, { captureId, x: 100, y: 20, width: 400, height: 100, componentType: "nav", note: "" });

    const crop = await asset(region.cropKey);

    const image = sharp(crop.bytes);
    expect(await image.metadata()).toMatchObject({ format: "webp", width: 400, height: 100 });
    // Rows 20 to 79 are the nav bar, 80 to 119 the page below it.
    const { data } = await image.clone().extract({ left: 0, top: 0, width: 1, height: 100 }).raw().toBuffer({ resolveWithObject: true });
    const green = (row: number) => data[row * 3 + 1];
    expect(green(10)).toBeLessThan(80);
    expect(green(90)).toBeGreaterThan(220);
    expect(region.note).toBeNull();
  });

  it("changes type and note, and agents see the change", async () => {
    const { slug, captureId } = await uploadPage("Bergchalet Preise");
    const region = await markOk(slug, { captureId, x: 0, y: 200, width: 1440, height: 400, componentType: "features", note: "Drei Karten" });

    const url = await app.serverFunctionUrl(regionsFile, "updateRegion");
    const result = await callServerFunction<typeof updateRegion>(
      browser,
      url,
      { id: region.id, componentType: "pricing", note: "Drei Zimmerkategorien mit Preis" },
      "POST",
    );

    expect(result).toEqual({ ok: true, id: region.id });
    const { components: pricing } = await findComponents("pricing");
    expect(pricing.find((component) => component.slug === slug)?.ownerNote).toBe("Drei Zimmerkategorien mit Preis");
    const { components: features } = await findComponents("features");
    expect(features.some((component) => component.slug === slug)).toBe(false);
  });

  it("must lie on the capture", async () => {
    const { slug, captureId } = await uploadPage("Stadthotel Rand");

    const result = await mark(slug, { captureId, x: 1400, y: 0, width: 100, height: 80, componentType: "nav", note: "" });

    expect(result).toEqual({ ok: false, reason: "Der Bereich liegt nicht ganz auf der Aufnahme." });
  });
});

describe("deleting", () => {
  it("a region removes its crop and small version", async () => {
    const { slug, captureId } = await uploadPage("Weingut Terrassen");
    const region = await markOk(slug, { captureId, x: 0, y: 0, width: 1440, height: 80, componentType: "footer", note: "" });
    expect((await asset(region.cropKey)).status).toBe(200);

    const url = await app.serverFunctionUrl(regionsFile, "deleteRegion");
    await callServerFunction<typeof deleteRegion>(browser, url, { id: region.id }, "POST");

    expect((await asset(region.cropKey)).status).toBe(404);
    expect((await asset(region.thumbKey)).status).toBe(404);
    const { components: footers } = await findComponents("footer");
    expect(footers.some((component) => component.slug === slug)).toBe(false);
  });

  it("the reference removes its regions with their files", async () => {
    const { slug, captureId } = await uploadPage("Almhütte Hero");
    const region = await markOk(slug, { captureId, x: 0, y: 80, width: 1440, height: 600, componentType: "hero", note: "" });

    const url = await app.serverFunctionUrl(libraryFile, "deleteReference");
    await callServerFunction<typeof deleteReference>(browser, url, { slug }, "POST");

    expect((await asset(region.cropKey)).status).toBe(404);
    expect((await asset(region.thumbKey)).status).toBe(404);
    expect(await getDb().select().from(referenceRegions).where(eq(referenceRegions.id, region.id))).toEqual([]);
  });
});
