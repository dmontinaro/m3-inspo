/**
 * URL imports as asynchronous jobs: the owner starts them in the UI, a worker
 * holding only WORKER_TOKEN drives them over /api/worker/* (claim, heartbeat,
 * uploads, complete, fail). A small fake worker client below speaks that API
 * against the in-process app.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { importJobs } from "@m3-inspo/db/library-schema";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken } from "./test/library";
import { maxUploadBytes } from "./lib/upload-limits";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { createUrlImport, listImportJobs, retryImportJob } from "./server/import-jobs.functions";
import type { getReference, setReferenceStatus } from "./server/library.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 9009, login: "import-owner", name: "Alex", email: "import-owner@example.com" };
const workerToken = "test-worker-token-with-at-least-32-characters";

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id), WORKER_TOKEN: workerToken, EMBEDDINGS_API_KEY: "" });
  browser = app.browser();
  browser.setCookie("PARAGLIDE_LOCALE", "de");
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// Only this file creates URL imports; a clean queue keeps "the next job" predictable.
// Analysis jobs belong to analysis.test.ts, which runs in parallel.
beforeEach(async () => {
  await getDb().delete(importJobs).where(eq(importJobs.kind, "url_capture"));
});

const jobsFile = "/src/server/import-jobs.functions.ts";

type ImportFields = { url: string; title?: string; takeNote?: string; avoidNote?: string; tags?: string[] };

/**
 * Starts a URL import the way the upload page's form does. By default as if
 * the owner had already confirmed a duplicate warning, since many tests here
 * import the same few addresses; `{ confirmDuplicate: false }` sends the
 * first submission as the form does.
 */
async function startImport(fields: ImportFields, requestId: string = randomUUID(), { confirmDuplicate = true } = {}) {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("url", fields.url);
  form.set("title", fields.title ?? "");
  form.set("takeNote", fields.takeNote ?? "");
  form.set("avoidNote", fields.avoidNote ?? "");
  for (const tag of fields.tags ?? []) form.append("tags", tag);
  if (confirmDuplicate) form.set("confirmDuplicate", "1");
  const url = await app.serverFunctionUrl(jobsFile, "createUrlImport");
  return callServerFunction<typeof createUrlImport>(browser, url, form);
}

async function listJobs() {
  return callServerFunction<typeof listImportJobs>(browser, await app.serverFunctionUrl(jobsFile, "listImportJobs"));
}

const claimedJob = z.object({
  id: z.string(),
  kind: z.literal("url_capture"),
  attempt: z.number(),
  leaseExpiresAt: z.string(),
  input: z.object({ url: z.string() }).loose(),
});
type ClaimedJob = z.infer<typeof claimedJob>;

const uploadTargetList = z.object({
  uploads: z.array(z.object({ id: z.string(), url: z.string(), method: z.literal("PUT") })),
});

/** A screenshot-like image, as the worker's browser would take it. */
const screenshot = (format: "png" | "jpeg", width = 1440, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: "#f4efe6" } })
    .toFormat(format)
    .toBuffer();

/**
 * The capture worker as the web app sees it: plain HTTP with the worker token,
 * no cookies. Most calls return the raw response.
 */
function fakeWorker(token = workerToken) {
  const post = (path: string, body: unknown = {}) =>
    app.fetch(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function claim() {
    const response = await post("/api/worker/claim");
    if (response.status !== 200) throw new Error(`claim answered ${response.status}`);
    return z.object({ job: claimedJob.nullable() }).parse(await response.json()).job;
  }

  /** `count` upload URLs for the holder of `job`. */
  async function uploadTargets(job: ClaimedJob, count: number) {
    const response = await post(`/api/worker/jobs/${job.id}/uploads`, { attempt: job.attempt, count });
    if (response.status !== 200) throw new Error(`uploads answered ${response.status}`);
    return uploadTargetList.parse(await response.json()).uploads;
  }

  /** One upload the way an HTTP client sends it: no token, with its Content-Length. */
  const put = (url: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
    app.fetch(url, {
      method: "PUT",
      headers: { "content-length": String(bytes.byteLength), ...headers },
      body: new Uint8Array(bytes),
    });

  return {
    post,
    claim,
    /** Claims the next job; fails the test if there is none. */
    async claimNext() {
      const job = await claim();
      if (!job) throw new Error("No job to claim.");
      return job;
    },
    heartbeat: (job: ClaimedJob, stage?: string) =>
      post(`/api/worker/jobs/${job.id}/heartbeat`, { attempt: job.attempt, stage }),
    uploadTargets,
    put,
    /** Asks for upload URLs and PUTs each image to its own, as the worker does with its screenshots. Returns the upload ids. */
    async upload(job: ClaimedJob, images: Uint8Array[]) {
      const uploads = await uploadTargets(job, images.length);
      for (const [index, target] of uploads.entries()) {
        const response = await put(target.url, images[index] ?? new Uint8Array());
        if (response.status !== 200) throw new Error(`upload answered ${response.status}`);
      }
      return uploads.map((target) => target.id);
    },
    complete: (job: ClaimedJob, result: Record<string, unknown>) =>
      post(`/api/worker/jobs/${job.id}/complete`, { attempt: job.attempt, ...result }),
    fail: (job: ClaimedJob, error: string) => post(`/api/worker/jobs/${job.id}/fail`, { attempt: job.attempt, error }),
  };
}

describe("starting a URL import", () => {
  it("queues a job that waits for the worker", async () => {
    const started = await startImport({ url: "stripe.com/pricing" });

    expect(started).toMatchObject({ ok: true });
    expect(await listJobs()).toMatchObject([
      { kind: "url_capture", status: "queued", url: "https://stripe.com/pricing", attempts: 0, maxAttempts: 3 },
    ]);
  });

  it("returns the existing job when the same request is sent twice", async () => {
    const requestId = randomUUID();

    const first = await startImport({ url: "https://linear.app" }, requestId);
    const second = await startImport({ url: "https://linear.app" }, requestId);

    expect(first.ok && second.ok && first.jobId === second.jobId).toBe(true);
    expect(await listJobs()).toHaveLength(1);
  });

  it("turns away an address with credentials", async () => {
    const started = await startImport({ url: "https://admin:secret@example.com" });

    expect(started).toEqual({ ok: false, reason: "Die Adresse darf keine Zugangsdaten enthalten." });
    expect(await listJobs()).toHaveLength(0);
  });

  it("turns away addresses in internal networks with a reason the owner understands", async () => {
    const refusals = {
      "http://169.254.169.254/latest/meta-data/": "Diese Adresse zeigt auf ein internes Netz und wird nicht importiert.",
      "http://10.0.0.1/": "Diese Adresse zeigt auf ein internes Netz und wird nicht importiert.",
      "http://[::1]/": "Diese Adresse zeigt auf ein internes Netz und wird nicht importiert.",
      "http://localhost:3000/": "Nur die Standard-Ports 80 und 443 sind erlaubt.",
      "https://postgres.railway.internal/": "Interne Rechnernamen werden nicht importiert.",
      "ftp://example.com/": "Bitte gib eine vollständige Adresse ein, die mit https:// oder http:// beginnt.",
    };

    for (const [url, reason] of Object.entries(refusals)) {
      expect(await startImport({ url }), url).toEqual({ ok: false, reason });
    }
    expect(await listJobs()).toHaveLength(0);
  });

  it("warns when the address is already in the library or being imported, and imports it again on request", async () => {
    const libraryUrl = "https://www.dublette-bibliothek.example/zimmer/";
    await startImport({ url: libraryUrl, title: "Dublette Zimmer" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [uploadId] = await worker.upload(job, [await screenshot("png")]);
    await worker.complete(job, { captures: [{ uploadId, viewport: "desktop", kind: "hero" }] });
    const slug = (await listJobs()).at(0)?.referenceSlug;

    // Scheme, "www.", a trailing slash, the fragment and tracking parameters do not make it a new page.
    const again = await startImport({ url: "http://dublette-bibliothek.example/zimmer?utm_source=newsletter#preise" }, randomUUID(), { confirmDuplicate: false });
    expect(again).toEqual({
      ok: false,
      reason: "Diese Adresse ist schon in der Bibliothek.",
      duplicate: { references: [{ slug, title: "Dublette Zimmer" }], openJobs: 0 },
    });

    await startImport({ url: "https://dublette-warteschlange.example" });
    const queued = await startImport({ url: "https://dublette-warteschlange.example/" }, randomUUID(), { confirmDuplicate: false });
    expect(queued).toEqual({
      ok: false,
      reason: "Diese Adresse wird schon importiert.",
      duplicate: { references: [], openJobs: 1 },
    });

    const confirmed = await startImport({ url: libraryUrl }, randomUUID(), { confirmDuplicate: true });
    expect(confirmed).toMatchObject({ ok: true });
    expect(await listJobs()).toHaveLength(3);
  });
});

describe("access to /api/worker", () => {
  it("hands the next job to the worker token", async () => {
    await startImport({ url: "https://linear.app", title: "Linear", tags: ["saas"] });

    const job = await fakeWorker().claim();

    expect(job).toMatchObject({ kind: "url_capture", attempt: 1, input: { url: "https://linear.app", title: "Linear", tags: ["saas"] } });
    expect(await listJobs()).toMatchObject([{ status: "processing", attempts: 1 }]);
  });

  it("answers 401 without a token or with a wrong one", async () => {
    await startImport({ url: "https://linear.app" });

    expect((await app.fetch("/api/worker/claim", { method: "POST" })).status).toBe(401);
    expect((await fakeWorker(`${workerToken}x`).post("/api/worker/claim")).status).toBe(401);
    expect((await fakeWorker("").post("/api/worker/claim")).status).toBe(401);
    expect((await listJobs())[0]?.status).toBe("queued");
  });

  // The router matches paths case-insensitively and ignores repeated and trailing slashes.
  const pathVariants = ["/api/worker/claim", "/api/worker/claim/", "/api/worker//claim", "/API/WORKER/CLAIM", "/api/Worker/claim"];

  it("answers 401 to the owner's session on every path variant", async () => {
    await startImport({ url: "https://linear.app" });

    for (const path of pathVariants) {
      expect((await browser.post(path)).status, path).toBe(401);
    }
    expect((await listJobs())[0]?.status).toBe("queued");
  });

  it("answers other methods with 401 without the token and 405 with it, never with a page", async () => {
    for (const method of ["GET", "DELETE", "PATCH"]) {
      const anonymous = await app.fetch("/api/worker/claim", { method });
      expect(anonymous.status, method).toBe(401);
      expect(anonymous.headers.get("content-type") ?? "", method).not.toContain("text/html");
      expect((await browser.send("/api/worker/claim", { method })).status, method).toBe(401);
      const withToken = await app.fetch("/api/worker/claim", { method, headers: { authorization: `Bearer ${workerToken}` } });
      expect(withToken.status, method).toBe(405);
    }
  });

  it("keeps look-alike paths such as /api/workerfoo behind the owner gate", async () => {
    const response = await app.fetch("/api/workerfoo", { headers: { authorization: `Bearer ${workerToken}` } });

    expect(response.status).toBe(401);
  });

  it("serves every path variant with the worker token", async () => {
    for (const path of pathVariants) {
      expect((await fakeWorker().post(path)).status, path).toBe(200);
    }
  });
});

/** Lets the job's lease run out, as if its worker had stopped sending heartbeats. */
async function expireLease(id: string) {
  await getDb()
    .update(importJobs)
    .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(importJobs.id, id));
}

describe("claiming jobs", () => {
  it("hands a job out again when its lease runs out, until the attempts are used up", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();

    const attempts = [];
    for (let claim = 0; claim < 4; claim++) {
      const job = await worker.claim();
      if (!job) break;
      attempts.push(job.attempt);
      await expireLease(job.id);
    }

    expect(attempts).toEqual([1, 2, 3]);
    expect(await listJobs()).toMatchObject([
      { status: "failed", attempts: 3, errorMessage: "Der Worker hat sich bei keinem Versuch zurückgemeldet." },
    ]);
  });

  it("does not hand out a job whose lease is still running", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();

    expect(await worker.claim()).not.toBeNull();
    expect(await worker.claim()).toBeNull();
  });

  it("never hands the same job to two parallel claims", async () => {
    await startImport({ url: "https://linear.app" });
    await startImport({ url: "https://stripe.com" });
    const worker = fakeWorker();

    const claimed = await Promise.all([worker.claim(), worker.claim(), worker.claim()]);

    const ids = claimed.flatMap((job) => (job ? [job.id] : []));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

const libraryFile = "/src/server/library.functions.ts";

async function findReference(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "getReference");
  return callServerFunction<typeof getReference>(browser, url, { slug });
}

async function approve(slug: string) {
  const url = await app.serverFunctionUrl(libraryFile, "setReferenceStatus");
  await callServerFunction<typeof setReferenceStatus>(browser, url, { slug, status: "approved" }, "POST");
}

// Drafts from here show in the gallery other files search: their words appear in no other test file.
describe("completing a job", () => {
  it("turns the uploaded captures into a draft with the owner's notes and tags, hidden from agents until approved", async () => {
    await startImport({
      url: "https://www.leuchtturm-import.example/",
      title: "Leuchtturm Import",
      takeNote: "Importierte Leuchtturmzeile",
      avoidNote: "Kein Importrauschen",
      tags: ["import-projekt", "leuchtturm"],
    });
    const worker = fakeWorker();
    const job = await worker.claimNext();

    expect((await worker.heartbeat(job, "capturing")).status).toBe(200);
    expect(await listJobs()).toMatchObject([{ status: "processing", stage: "capturing" }]);
    const [desktop, mobile] = await worker.upload(job, [await screenshot("png"), await screenshot("jpeg", 750, 1624)]);
    const completed = await worker.complete(job, {
      pageTitle: "Leuchtturm™ | Home",
      captures: [
        { uploadId: desktop, viewport: "desktop", kind: "full" },
        { uploadId: mobile, viewport: "mobile", kind: "full" },
      ],
    });

    expect(completed.status).toBe(200);
    const listed = (await listJobs()).at(0);
    expect(listed).toMatchObject({ status: "ready", stage: null, errorMessage: null });
    const slug = listed?.referenceSlug ?? "";
    expect(await findReference(slug)).toMatchObject({
      title: "Leuchtturm Import",
      sourceUrl: "https://www.leuchtturm-import.example/",
      siteHost: "www.leuchtturm-import.example",
      curationStatus: "draft",
      takeNote: "Importierte Leuchtturmzeile",
      avoidNote: "Kein Importrauschen",
      tags: ["import-projekt", "leuchtturm"],
      captures: [
        { width: 1440, height: 900 },
        { width: 750, height: 1624 },
      ],
    });

    const agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
    expect((await callTool(agent, "get_screen", { slug })).json.error).toBe(`No screen with slug '${slug}'.`);
    await approve(slug);
    expect((await callTool(agent, "get_screen", { slug })).json).toMatchObject({
      slug,
      taste: { take: "Importierte Leuchtturmzeile" },
    });
  });

  it("queues the AI analysis of the new draft when the analysis is on", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    onTestFinished(() => void vi.unstubAllEnvs());
    await startImport({ url: "https://analyse-import.example" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [uploadId] = await worker.upload(job, [await screenshot("png")]);
    await worker.complete(job, { captures: [{ uploadId, viewport: "desktop", kind: "hero" }] });

    const referenceId = (await getDb().query.importJobs.findFirst({ where: eq(importJobs.id, job.id) }))?.referenceId ?? "";
    // Removed right away, so analysis.test.ts running in parallel never picks it up.
    const queued = await getDb()
      .delete(importJobs)
      .where(and(eq(importJobs.kind, "analysis"), eq(importJobs.referenceId, referenceId)))
      .returning({ status: importJobs.status, input: importJobs.input });
    expect(queued).toEqual([{ status: "queued", input: { trigger: "import" } }]);
  });

  it("names the draft after the page title when the owner gave none", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [uploadId] = await worker.upload(job, [await screenshot("png")]);

    await worker.complete(job, {
      pageTitle: "  Linear – Plan and build products  ",
      captures: [{ uploadId, viewport: "desktop", kind: "hero" }],
    });

    const listed = (await listJobs()).at(0);
    expect(await findReference(listed?.referenceSlug ?? "")).toMatchObject({
      title: "Linear – Plan and build products",
      tags: [],
    });
  });
});

/** Design values as the worker reads them from a page. */
const pageTokens = {
  palette: ["#faf7f2", "#c7402f", "#1d2433"],
  fonts: ["Tiempos Headline", "Söhne"],
  typeRamp: [{ role: "h1", family: "Tiempos Headline", sizePx: 64, weight: 500, lineHeight: 1.1, letterSpacing: "-0.02em" }],
  spacingScale: [8, 16, 24, 48],
  radiusScale: [4, 12],
  containerWidth: 1120,
  cssVariables: { "--brand": "#c7402f", "--paper": "#faf7f2" },
};

describe("design values read from the page", () => {
  it("are kept with the draft and reach agents with their provenance once it is approved", async () => {
    await startImport({ url: "https://www.fjordwerte.example/", title: "Fjordwerte Startseite" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [desktop, mobile] = await worker.upload(job, [await screenshot("png"), await screenshot("png", 750, 1624)]);

    const completed = await worker.complete(job, {
      captures: [
        { uploadId: desktop, viewport: "desktop", kind: "hero" },
        { uploadId: mobile, viewport: "mobile", kind: "hero" },
      ],
      tokens: pageTokens,
      tech: ["Next.js", "Vercel"],
      mode: "light",
    });

    expect(completed.status).toBe(200);
    const slug = (await listJobs()).at(0)?.referenceSlug ?? "";
    expect(await findReference(slug)).toMatchObject({
      analysis: {
        palette: [
          { value: "#faf7f2", source: "dom" },
          { value: "#c7402f", source: "dom" },
          { value: "#1d2433", source: "dom" },
        ],
        fonts: [
          { value: "Tiempos Headline", source: "dom" },
          { value: "Söhne", source: "dom" },
        ],
        tech: ["Next.js", "Vercel"],
        mode: "light",
      },
    });

    await approve(slug);
    const agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
    expect((await callTool(agent, "get_screen", { slug })).json).toMatchObject({
      slug,
      palette: pageTokens.palette,
      fonts: pageTokens.fonts,
      tech: ["Next.js", "Vercel"],
      mode: "light",
      mobile: expect.stringContaining("/api/assets/"),
      provenance: {
        palette: "dom",
        fonts: "dom",
        typeRamp: "dom",
        spacingScale: "dom",
        radiusScale: "dom",
        containerWidth: "dom",
        cssVariables: "dom",
      },
    });
    const byColor = (await callTool(agent, "find_by_color", { hex: "#c7402f", tolerance: 0.02 })).json;
    expect(byColor.results).toContainEqual(expect.objectContaining({ slug }));
    const designMd = await agent.callTool({ name: "get_design_system", arguments: { slug, live: false } });
    expect(JSON.stringify(designMd.content)).toContain("Tiempos Headline");
  });

  it("are turned away when malformed or too large", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [uploadId] = await worker.upload(job, [await screenshot("png")]);
    const captures = [{ uploadId, viewport: "desktop", kind: "hero" }];

    const payloads = [
      { tokens: { ...pageTokens, palette: ["red"] } },
      { tokens: { ...pageTokens, palette: Array.from({ length: 50 }, (_, i) => `#0000${String(i).padStart(2, "0")}`) } },
      { tokens: { ...pageTokens, cssVariables: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`--v${i}`, "1px"])) } },
      { tokens: { ...pageTokens, cssVariables: { color: "red" } } },
      { tokens: { ...pageTokens, cssVariables: { "--long": "x".repeat(5000) } } },
      { tokens: { ...pageTokens, fonts: ["x".repeat(500)] } },
      { tokens: { ...pageTokens, provenance: "manual" } },
      { tokens: pageTokens, mode: "sepia" },
      { tokens: pageTokens, tech: Array.from({ length: 100 }, (_, i) => `Tech ${i}`) },
    ];
    for (const payload of payloads) {
      expect((await worker.complete(job, { captures, ...payload })).status, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
    expect(await listJobs()).toMatchObject([{ status: "processing", referenceSlug: null }]);
  });
});

describe("refused results", () => {
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
  );

  it("turns away results that do not fit the schema", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [uploadId] = await worker.upload(job, [await screenshot("png")]);

    const results = [
      {},
      { captures: [] },
      { captures: [{ uploadId, viewport: "tablet", kind: "full" }] },
      { captures: [{ uploadId, viewport: "desktop", kind: "full" }], html: "<p>extra</p>" },
    ];
    for (const result of results) {
      expect((await worker.complete(job, result)).status, JSON.stringify(result)).toBe(400);
    }
    expect(await listJobs()).toMatchObject([{ status: "processing", referenceSlug: null }]);
  });

  it("turns away captures that are no clean image, like a normal upload", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const [good, vector, broken] = await worker.upload(job, [
      await screenshot("png"),
      svg,
      (await screenshot("png")).subarray(0, 200),
    ]);

    for (const uploadId of [vector, broken, randomUUID()]) {
      const response = await worker.complete(job, {
        captures: [
          { uploadId: good, viewport: "desktop", kind: "full" },
          { uploadId, viewport: "mobile", kind: "full" },
        ],
      });
      expect(response.status).toBe(422);
      const rejection = z.object({ error: z.string() }).parse(await response.json());
      expect(rejection.error).toContain(`Capture 2 (${uploadId}):`);
    }
    expect(await listJobs()).toMatchObject([{ status: "processing", referenceSlug: null }]);
  });

  it("does not take an upload without a valid signature", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    const response = await worker.post(`/api/worker/jobs/${job.id}/uploads`, { attempt: job.attempt, count: 1 });
    const target = uploadTargetList.parse(await response.json()).uploads.at(0);
    const forged = target?.url.replace(/signature=[0-9a-f]+/, `signature=${"0".repeat(64)}`) ?? "";
    expect(forged).not.toBe(target?.url);

    expect((await app.fetch(forged, { method: "PUT", body: svg })).status).toBe(403);
  });

  it("answers 401 on every job call without the worker token", async () => {
    await startImport({ url: "https://linear.app" });
    const job = await fakeWorker().claimNext();
    const stranger = fakeWorker("inspo_mcp_not-the-worker-token-at-all-000000");

    for (const call of [stranger.heartbeat(job), stranger.complete(job, {}), stranger.fail(job, "x")]) {
      expect((await call).status).toBe(401);
    }
    const withSession = await browser.post(`/api/worker/jobs/${job.id}/fail`, { attempt: job.attempt, error: "x" });
    expect(withSession.status).toBe(401);
    expect(await listJobs()).toMatchObject([{ status: "processing" }]);
  });

  it("answers 404 for unknown jobs and 409 to a worker that no longer holds the job", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const first = await worker.claimNext();

    expect((await worker.heartbeat({ ...first, id: randomUUID() })).status).toBe(404);
    expect((await worker.post("/api/worker/jobs/not-a-uuid/heartbeat", { attempt: 1 })).status).toBe(404);

    await expireLease(first.id);
    const second = await worker.claimNext();
    expect(second).toMatchObject({ id: first.id, attempt: 2 });
    expect((await worker.heartbeat(first)).status).toBe(409);
    const late = await worker.complete(first, { captures: [{ uploadId: randomUUID(), viewport: "desktop", kind: "full" }] });
    expect(late.status).toBe(409);
  });
});

async function retry(id: string) {
  const url = await app.serverFunctionUrl(jobsFile, "retryImportJob");
  return callServerFunction<typeof retryImportJob>(browser, url, { id }, "POST");
}

describe("failed jobs", () => {
  it("keep only a clean error: no stack trace, headers, tokens or credentials", async () => {
    await startImport({ url: "https://intranet.example.com" });
    const worker = fakeWorker();
    const job = await worker.claimNext();

    const failed = await worker.fail(
      job,
      [
        "page.goto: net::ERR_CONNECTION_REFUSED at https://admin:hunter2@intranet.example.com/login?session=abc123#top",
        "    at Page.goto (/app/node_modules/playwright-core/lib/client/page.js:470:12)",
        "Authorization: Bearer inspo_mcp_Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4",
        "Cookie: better-auth.session_token=s3cr3t",
      ].join("\n"),
    );

    expect(failed.status).toBe(200);
    expect(await listJobs()).toMatchObject([
      {
        status: "failed",
        attempts: 1,
        errorMessage: "page.goto: net::ERR_CONNECTION_REFUSED at https://intranet.example.com/login",
      },
    ]);
  });

  it("hide secrets within the first line and cut long errors short", async () => {
    /** Fails a fresh job with `error` and returns what the job list shows. */
    async function storedError(error: string) {
      await startImport({ url: "https://linear.app" });
      const worker = fakeWorker();
      const job = await worker.claimNext();
      await worker.fail(job, error);
      return (await listJobs()).find((listed) => listed.id === job.id)?.errorMessage;
    }

    expect(await storedError("Upload failed: authorization: Bearer abc.def token=xyz")).toBe(
      "Upload failed: authorization: [entfernt]",
    );
    expect(await storedError("Request sent with Cookie: session=a1b2; theme=dark; lang=de")).toBe(
      "Request sent with Cookie: [entfernt]",
    );
    expect(await storedError("Rejected token=xyz and key AbC/dEf+gHiJkLmNoPqRsTuVwXyZ0123456789/== twice")).toBe(
      "Rejected token: [entfernt] and key [entfernt] twice",
    );
    expect(await storedError(`Denied example_${"aB3".repeat(16)} here`)).toBe("Denied [entfernt] here");
    const long = await storedError(`Timeout ${"waiting ".repeat(200)}`);
    expect(long).toHaveLength(300);
    expect(long?.endsWith("…")).toBe(true);
  });

  it("go back to the queue with three more attempts when the owner retries them", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    await worker.fail(job, "Navigation timeout of 45000 ms exceeded");

    expect(await retry(job.id)).toBe(true);

    expect(await listJobs()).toMatchObject([{ status: "queued", attempts: 1, maxAttempts: 4, errorMessage: null }]);
    expect(await worker.claim()).toMatchObject({ id: job.id, attempt: 2 });
    expect(await retry(job.id)).toBe(false);
  });

  it("leave a worker from before the retry without a hold on the new run", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const stale = await worker.claimNext();
    await worker.fail(stale, "Timeout");
    await retry(stale.id);
    await worker.claimNext();

    expect((await worker.heartbeat(stale)).status).toBe(409);
    expect((await worker.fail(stale, "late")).status).toBe(409);
  });
});

describe("the lease", () => {
  it("runs for another five minutes after a heartbeat", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const job = await worker.claimNext();
    await getDb()
      .update(importJobs)
      .set({ leaseExpiresAt: new Date(Date.now() + 10_000) })
      .where(eq(importJobs.id, job.id));

    const response = await worker.heartbeat(job);

    const { leaseExpiresAt } = z.object({ leaseExpiresAt: z.coerce.date() }).parse(await response.json());
    expect(leaseExpiresAt.getTime()).toBeGreaterThan(Date.now() + 4.5 * 60_000);
  });
});

/** Whether anything the worker uploaded for the job is still waiting in storage. */
const hasStagedUploads = (jobId: string) =>
  existsSync(join(process.env.STORAGE_DIR ?? "", "staging", "import-jobs", jobId));

describe("uploads", () => {
  it("are refused once their attempt no longer holds the job, and a later attempt never uses them", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const first = await worker.claimNext();
    const [early, late] = await worker.uploadTargets(first, 2);
    expect((await worker.put(early.url, await screenshot("png"))).status).toBe(200);

    await expireLease(first.id);
    const second = await worker.claimNext();

    expect((await worker.put(late.url, await screenshot("png"))).status).toBe(409);
    const completed = await worker.complete(second, {
      captures: [{ uploadId: early.id, viewport: "desktop", kind: "full" }],
    });
    expect(completed.status).toBe(422);
  });

  it("need an unexpired URL signed for exactly this key, a length and at most the upload limit", async () => {
    await startImport({ url: "https://linear.app" });
    const worker = fakeWorker();
    const [a, b] = await worker.uploadTargets(await worker.claimNext(), 2);
    const image = await screenshot("png");
    const urlA = new URL(a.url, "http://app");
    const urlB = new URL(b.url, "http://app");

    expect((await worker.put(`${urlB.pathname}${urlA.search}`, image)).status).toBe(403);
    const withoutLength = await app.fetch(urlA.pathname + urlA.search, { method: "PUT", body: new Uint8Array(image) });
    expect(withoutLength.status).toBe(411);
    const oversized = await worker.put(urlA.pathname + urlA.search, image, { "content-length": String(maxUploadBytes + 1) });
    expect(oversized.status).toBe(413);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 11 * 60_000);
      expect((await worker.put(urlA.pathname + urlA.search, image)).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it("are cleared away when the job is done, fails or runs out of attempts", async () => {
    const worker = fakeWorker();
    const image = await screenshot("png");

    await startImport({ url: "https://linear.app" });
    const done = await worker.claimNext();
    const [uploadId] = await worker.upload(done, [image]);
    expect(hasStagedUploads(done.id)).toBe(true);
    await worker.complete(done, { captures: [{ uploadId, viewport: "desktop", kind: "full" }] });
    expect(hasStagedUploads(done.id)).toBe(false);

    await startImport({ url: "https://stripe.com" });
    const failed = await worker.claimNext();
    await worker.upload(failed, [image]);
    await worker.fail(failed, "Timeout");
    expect(hasStagedUploads(failed.id)).toBe(false);

    await startImport({ url: "https://www.airbnb.de" });
    const abandoned = await worker.claimNext();
    await worker.upload(abandoned, [image]);
    await getDb().update(importJobs).set({ maxAttempts: 1 }).where(eq(importJobs.id, abandoned.id));
    await expireLease(abandoned.id);
    expect(await listJobs()).toContainEqual(expect.objectContaining({ id: abandoned.id, status: "failed" }));
    expect(hasStagedUploads(abandoned.id)).toBe(false);
  });
});
