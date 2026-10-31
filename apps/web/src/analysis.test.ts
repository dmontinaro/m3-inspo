/**
 * The AI analysis: jobs queued by uploads and "Neu analysieren", run by the
 * analysis runner against a fake vision model with a fixed answer, and what
 * the detail page then shows. Without ANTHROPIC_API_KEY the library works
 * as before.
 */

import { and, desc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { importJobs, referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import { DISPLAY_CLASSES } from "@m3-inspo/taxonomy";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import { runNextAnalysis } from "./server/analysis.server";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { AnalysisRequest, VisionModel } from "./server/analysis-model.server";
import type { getReference, listGallery, reanalyzeReference, updateReference } from "./server/library.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 1313, login: "analysis-owner", name: "Alex", email: "analysis-owner@example.com" };

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const libraryFile = "/src/server/library.functions.ts";

/** A model answer as structured output would return it, with values outside the taxonomy mixed in. */
const answer = {
  style: ["minimalism", "cyberpunk"],
  industry: ["travel", "hotels"],
  components: ["hero-with-cta", "booking-widget"],
  vibe: ["calm", "zen"],
  colorWords: ["warm", "beige"],
  macrostructure: "marquee-hero",
  description: {
    de: "Ruhige Serifen auf warmem Papierton, viel Weißraum und ein einziges Foto als Hero.",
    en: "Calm serifs on a warm paper tone, generous white space and a single photo as the hero.",
  },
  layoutSummary: {
    de: "Zentrierte Navigation, darunter ein vollflächiges Foto mit Buchungs-CTA.",
    en: "Centred navigation above a full-bleed photo with a booking CTA.",
  },
  mode: "light",
  palette: [
    { hex: "#F4EFE6", confidence: 0.9 },
    { hex: "tan", confidence: 0.5 },
  ],
  fontStyles: [
    { style: "roman-serif", confidence: 0.7 },
    { style: "Canela", confidence: 0.95 },
  ],
};

/** A vision model that answers `result` every time and keeps what it was asked. */
function fakeVision(result: unknown, model = "claude-opus-5-5") {
  const requests: AnalysisRequest[] = [];
  const vision: VisionModel = {
    model,
    analyze: async (request) => {
      requests.push(request);
      return result;
    },
  };
  return { vision, requests };
}

/** Runs queued analysis jobs until the queue is empty, as the runner would. */
async function analyzeQueued(vision: VisionModel) {
  while (await runNextAnalysis(vision)) {
    // one job per round
  }
}

const referenceId = async (slug: string) =>
  (await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) }))?.id ?? "";

async function detail(slug: string) {
  return callServerFunction<typeof getReference>(browser, await app.serverFunctionUrl(libraryFile, "getReference"), { slug });
}

describe("the AI analysis", () => {
  it("keeps only tags from the taxonomy and shows the latest version with the model that wrote it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const slug = await uploadScreenshot(app, browser, "Hotel Seeblick Analyse", { takeNote: "Die ruhige Typografie" });
    const first = fakeVision(answer);

    await analyzeQueued(first.vision);

    expect(first.requests).toMatchObject([{ sourceKind: "image", takeNote: "Die ruhige Typografie", images: [{ label: "Uploaded screenshot:" }] }]);
    expect((await detail(slug)).generated).toMatchObject({
      model: "claude-opus-5-5",
      version: 1,
      tags: { style: ["minimalism"], industry: ["travel"], components: ["hero-with-cta"], vibe: ["calm"], colorWords: ["warm"] },
      macrostructure: "marquee-hero",
      description: answer.description,
      layoutSummary: answer.layoutSummary,
    });
    const agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
    expect((await callTool(agent, "get_screen", { slug })).json).toMatchObject({
      description: answer.description.en,
      layoutSummary: answer.layoutSummary.en,
      tags: { style: ["minimalism"], industry: ["travel"] },
      macrostructure: { slug: "marquee-hero" },
    });

    const reanalyze = await app.serverFunctionUrl(libraryFile, "reanalyzeReference");
    expect(await callServerFunction<typeof reanalyzeReference>(browser, reanalyze, { slug }, "POST")).toBe("queued");
    const description = { de: "Zweite Fassung.", en: "Second take." };
    await analyzeQueued(fakeVision({ ...answer, description, macrostructure: "not-a-shape" }, "claude-opus-5").vision);

    expect((await detail(slug)).generated).toMatchObject({ model: "claude-opus-5", version: 2, description, macrostructure: null });
  });

  it("leaves an image reference without DOM values and without claimed font families", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const slug = await uploadScreenshot(app, browser, "Hotel Alpenrose Analyse");
    const id = await referenceId(slug);
    // An earlier version that wrongly claims values read from a DOM the image does not have.
    await getDb()
      .insert(referenceAnalyses)
      .values({
        referenceId: id,
        version: 1,
        generatedBy: "capture",
        tokens: {
          fonts: [{ value: "Inter", source: "dom" }],
          palette: [{ value: "#000000", source: "dom" }],
          spacingScale: [{ value: 8, source: "dom" }],
        },
      });

    await analyzeQueued(fakeVision(answer).vision);

    const current = await getDb().query.referenceAnalyses.findFirst({
      where: eq(referenceAnalyses.referenceId, id),
      orderBy: [desc(referenceAnalyses.version)],
    });
    expect(current?.version).toBe(2);
    const tokens = current?.tokens ?? {};
    const sources = Object.values(tokens).flatMap((field) =>
      (Array.isArray(field) ? field : "source" in field ? [field] : Object.values(field)).map((token) => token.source),
    );
    expect(sources).not.toContain("dom");
    expect(tokens.fonts).toEqual([{ value: "roman-serif", source: "vision", confidence: 0.7 }]);
    expect(tokens.fonts?.every((font) => (DISPLAY_CLASSES as readonly string[]).includes(font.value))).toBe(true);
    expect(tokens.palette).toEqual([{ value: "#f4efe6", source: "vision", confidence: 0.9 }]);
  });
});

describe("without ANTHROPIC_API_KEY", () => {
  it("uploads, curates and finds references by text, and queues no analysis", async () => {
    const slug = await uploadScreenshot(app, browser, "Pension Morgentau");
    const edit = new FormData();
    for (const [name, value] of Object.entries({ slug, title: "Pension Morgentau", sourceUrl: "", attribution: "", avoidNote: "", focus: "" })) {
      edit.set(name, value);
    }
    edit.set("takeNote", "Frühstückskarte mit Kupferakzenten");
    const updated = await callServerFunction<typeof updateReference>(browser, await app.serverFunctionUrl(libraryFile, "updateReference"), edit);
    const found = await callServerFunction<typeof listGallery>(browser, await app.serverFunctionUrl(libraryFile, "listGallery"), {
      query: "kupferakzent",
    });

    expect(updated).toEqual({ ok: true });
    expect(found.map((reference) => reference.slug)).toEqual([slug]);
    expect(await detail(slug)).toMatchObject({ takeNote: "Frühstückskarte mit Kupferakzenten", analysisEnabled: false, generated: null });
    const reanalyze = await app.serverFunctionUrl(libraryFile, "reanalyzeReference");
    expect(await callServerFunction<typeof reanalyzeReference>(browser, reanalyze, { slug }, "POST")).toBe("disabled");
    const jobs = await getDb()
      .select({ id: importJobs.id })
      .from(importJobs)
      .where(and(eq(importJobs.kind, "analysis"), eq(importJobs.referenceId, await referenceId(slug))));
    expect(jobs).toEqual([]);
  });
});
