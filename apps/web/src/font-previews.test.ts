/**
 * Font previews (#91): saving a pairing with a "Link zur Schrift" for an
 * adobe or local family queues one capture per URL, the capture worker takes
 * it over /api/worker/* like a URL import, and the pairing's detail shows
 * the stored image. A small fake worker speaks that API.
 */

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { fontPreviews, importJobs } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { RoleFont } from "#/lib/fonts";
import type { addTypePairing, getTypePairing, recaptureFontPage } from "./server/type-pairings.functions";

const owner: GithubAccount = { id: 9292, login: "font-previews-owner", name: "Alex", email: "font-previews-owner@example.com" };
const workerToken = "test-worker-token-for-font-previews-0123456789";

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id), WORKER_TOKEN: workerToken });
  browser = app.browser();
  browser.setCookie("PARAGLIDE_LOCALE", "de");
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// Only this file queues font previews; a clean queue keeps "the next job" predictable.
beforeEach(async () => {
  await getDb().delete(fontPreviews);
  await getDb().delete(importJobs).where(eq(importJobs.kind, "font_preview"));
});

const pairingsFile = "/src/server/type-pairings.functions.ts";

/** A local family; `.example` names never resolve, so the URL guard leaves them to the worker. */
const local = (family: string, pageUrl?: string): RoleFont => ({ family, weights: [400], category: "sans", source: "local", pageUrl });
const fontsource = (family: string): RoleFont => ({ family, weights: [400], category: "serif", source: "fontsource", fontsourceId: family.toLowerCase() });

async function save(name: string, roles: unknown) {
  const url = await app.serverFunctionUrl(pairingsFile, "addTypePairing");
  return callServerFunction<typeof addTypePairing>(browser, url, { name, note: "", roles }, "POST");
}

async function pairing(slug: string) {
  return callServerFunction<typeof getTypePairing>(browser, await app.serverFunctionUrl(pairingsFile, "getTypePairing"), { slug });
}

const claimedJob = z.object({ id: z.string(), kind: z.literal("font_preview"), attempt: z.number(), input: z.object({ pageUrl: z.string() }) });
type ClaimedJob = z.infer<typeof claimedJob>;

/** The capture worker for font previews: claims only `font_preview` jobs. */
function fakeWorker() {
  const post = (path: string, body: unknown) =>
    app.fetch(path, {
      method: "POST",
      headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    async claim() {
      const response = await post("/api/worker/claim", { kinds: ["font_preview"] });
      return z.object({ job: claimedJob.nullable() }).parse(await response.json()).job;
    },
    /** Uploads `png` and reports it as the job's desktop hero. */
    async complete(job: ClaimedJob, png: Uint8Array) {
      const targets = await post(`/api/worker/jobs/${job.id}/uploads`, { attempt: job.attempt, count: 1 });
      const [target] = z.object({ uploads: z.array(z.object({ id: z.string(), url: z.string() })) }).parse(await targets.json()).uploads;
      await app.fetch(target.url, { method: "PUT", headers: { "content-length": String(png.byteLength) }, body: new Uint8Array(png) });
      return post(`/api/worker/jobs/${job.id}/complete`, {
        attempt: job.attempt,
        captures: [{ uploadId: target.id, viewport: "desktop", kind: "hero" }],
      });
    },
    fail: (job: ClaimedJob, error: string) => post(`/api/worker/jobs/${job.id}/fail`, { attempt: job.attempt, error }),
  };
}

const foundryShot = () => sharp({ create: { width: 1440, height: 900, channels: 3, background: "#101010" } }).png().toBuffer();

describe("font previews", () => {
  it("captures a linked font's page once and shows it on every pairing that links it", async () => {
    const pageUrl = "https://foundry.example/fonts/soehne";
    const first = await save("Söhne pur", { heading: local("Söhne", pageUrl), body: local("Söhne Mono") });
    const second = await save("Söhne mit Serife", { heading: local("Söhne", pageUrl), body: fontsource("Lora") });
    if (first.status !== "saved" || second.status !== "saved") throw new Error(JSON.stringify({ first, second }));

    expect((await pairing(first.slug)).previews).toEqual({ [pageUrl]: { status: "capturing", image: null, error: null } });

    const worker = fakeWorker();
    const job = await worker.claim();
    expect(job?.input).toEqual({ pageUrl });
    expect((await worker.complete(job!, await foundryShot())).status).toBe(200);
    expect(await worker.claim()).toBeNull();

    const { previews } = await pairing(second.slug);
    expect(previews[pageUrl]).toMatchObject({ status: "ready", image: { width: 1440, height: 900 }, error: null });
    const image = await browser.get(previews[pageUrl]!.image!.url);
    expect(image.headers.get("content-type")).toBe("image/webp");
  });

  it("refuses a link the URL guard blocks, and one that is no web address", async () => {
    for (const pageUrl of ["http://localhost/fonts", "http://10.0.0.8/fonts", "ftp://foundry.example/fonts"]) {
      const result = await save("Gesperrt", { heading: local("Sperrschrift", pageUrl), body: fontsource("Lora") });
      expect(result).toMatchObject({ status: "invalid", errors: { roles: [expect.stringMatching(/Link zur Schrift|Adresse/)] } });
    }
  });

  it("shows why a capture failed and captures again on request, keeping one capture at a time", async () => {
    const pageUrl = "https://foundry.example/fonts/gt-america";
    const saved = await save("Amerika", { heading: local("GT America", pageUrl), body: fontsource("Lora") });
    if (saved.status !== "saved") throw new Error(JSON.stringify(saved));
    const worker = fakeWorker();
    await worker.fail((await worker.claim())!, "The site showed a bot check instead of the page.");

    expect((await pairing(saved.slug)).previews[pageUrl]).toEqual({
      status: "failed",
      image: null,
      error: "The site showed a bot check instead of the page.",
    });

    const recapture = await app.serverFunctionUrl(pairingsFile, "recaptureFontPage");
    await callServerFunction<typeof recaptureFontPage>(browser, recapture, { url: pageUrl }, "POST");
    await callServerFunction<typeof recaptureFontPage>(browser, recapture, { url: pageUrl }, "POST");

    expect((await pairing(saved.slug)).previews[pageUrl]?.status).toBe("capturing");
    expect(await worker.claim()).toMatchObject({ input: { pageUrl } });
    expect(await worker.claim()).toBeNull();
  });
});
