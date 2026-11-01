/**
 * "Mit KI entwerfen" in a kit's design briefing: what the model reads about
 * the kit and its references, and how the draft answers without a key or
 * when the model fails. The model is a fake that keeps the prompt. Other
 * test files share the database, so this file's names carry its run marker.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { briefingSections, briefingTemplate } from "./lib/briefing-content";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { referenceAnalyses, references } from "@m3-inspo/db/library-schema";
import { claudeBriefingWriter, draftKitBriefing } from "./server/kit-briefing.server";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { draftBrandKitDesignBriefing, getBrandKit, saveBrandKit } from "./server/brand-kits.functions";

const owner: GithubAccount = { id: 5252, login: "kit-briefing-owner", name: "Alex", email: "kit-briefing-owner@example.com" };
const run = randomUUID().slice(0, 8);
const project = `briefing-${run}`;
const file = "/src/server/brand-kits.functions.ts";

let app: TestApp;
let browser: TestBrowser;
let kitSlug = "";

/** The id of the reference with this slug. */
const idOf = async (slug: string) =>
  (await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, slug) }))?.id ?? "";

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);

  const source = await uploadScreenshot(app, browser, `Seehotel Quelle ${run}`, { takeNote: "Kupferorange nur für Buchen", tags: [project] });
  const sibling = await uploadScreenshot(app, browser, `Bergresort ${run}`, { avoidNote: "Keine Kennzahl-Kacheln", tags: [project] });
  const draft = await uploadScreenshot(app, browser, `Entwurf ${run}`, { takeNote: "Entwurfsnotiz", tags: [project] });
  await getDb().update(references).set({ curationStatus: "draft" }).where(eq(references.slug, draft));
  await getDb()
    .insert(referenceAnalyses)
    .values({
      referenceId: await idOf(sibling),
      version: 1,
      mode: "light",
      generatedBy: "analysis",
      model: "claude-opus-5-5",
      tokens: { palette: [{ value: "#1d4a66", source: "vision", confidence: 0.6 }] },
      description: { de: "Ruhige Fotostrecke mit viel Weißraum.", en: "Calm photo spread." },
      layoutSummary: { de: "Hero, dann ein Grid aus Zimmern.", en: "Hero, then a room grid." },
    });

  const saved = await callServerFunction<typeof saveBrandKit>(
    browser,
    await app.serverFunctionUrl(file, "saveBrandKit"),
    {
      name: `Seehotel ${run}`,
      project,
      scheme: {
        sources: {
          brand: { hex: "#e56236", lock: "exact", origin: { kind: "reference", referenceId: await idOf(source), measuredBy: "dom" } },
          neutral: { hex: "#8a7a72", lock: "exact", origin: { kind: "manual" } },
          extras: [],
        },
        primary: "vivid",
      },
    },
    "POST",
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
  kitSlug = saved.slug;
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("Mit KI entwerfen", () => {
  it("drafts from the kit's colours, its source reference and the project's approved references", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const prompts: string[] = [];
    const result = await draftKitBriefing({ slug: kitSlug, outputLanguage: "de" }, async (prompt) => {
      prompts.push(prompt);
      return "# Seehotel\n\n## Geltungsbereich\n\n- Buchungsstrecke";
    });

    expect(result).toEqual({ ok: true, briefing: "# Seehotel\n\n## Geltungsbereich\n\n- Buchungsstrecke" });
    const kit = await callServerFunction<typeof getBrandKit>(browser, await app.serverFunctionUrl(file, "getBrandKit"), { slug: kitSlug });
    const [prompt = ""] = prompts;
    expect(prompt).toContain(`Brand Kit: Seehotel ${run}`);
    expect(prompt).toContain(`- primary: ${kit.colorScheme.snapshot.roles.primary.hex}`);
    expect(prompt).toContain(`Reference „Seehotel Quelle ${run}“ (a source reference of the kit's colours)`);
    expect(prompt).toContain("Owner's note, take: Kupferorange nur für Buchen");
    expect(prompt).toContain(`Reference „Bergresort ${run}“ (an approved reference of the project)`);
    expect(prompt).toContain("Owner's note, avoid: Keine Kennzahl-Kacheln");
    expect(prompt).toContain("AI description: Ruhige Fotostrecke mit viel Weißraum.");
    expect(prompt).toContain("Palette: #1d4a66");
    // Drafts never inform a briefing.
    expect(prompt).not.toContain("Entwurfsnotiz");
  });

  it.each(["en", "de"] as const)("fixes %s output, sources and headings without saving the draft", async (outputLanguage) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const requests: { system: string; messages: { content: string }[] }[] = [];
    const writer = claudeBriefingWriter(new Anthropic({
      apiKey: "synthetic-key",
      fetch: async (_request, init) => {
        requests.push(z.object({ system: z.string(), messages: z.array(z.object({ content: z.string() })) }).parse(JSON.parse(String(init?.body))));
        await Promise.resolve();
        return Response.json({ id: "synthetic-message", type: "message", role: "assistant", model: "synthetic-model", content: [{ type: "text", text: briefingTemplate(`Seehotel ${run}`, outputLanguage) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
      },
    }));
    const result = await draftKitBriefing({ slug: kitSlug, outputLanguage }, writer);
    expect(result).toEqual({ ok: true, briefing: briefingTemplate(`Seehotel ${run}`, outputLanguage).trim() });
    const request = requests[0];
    expect(request.system).toContain(outputLanguage === "de" ? "Write natural German Markdown" : "Write natural English Markdown");
    for (const heading of briefingSections[outputLanguage]) expect(request.system).toContain(heading);
    const prompt = request.messages[0]?.content;
    expect(prompt).toContain(outputLanguage === "de" ? "AI description: Ruhige Fotostrecke mit viel Weißraum." : "AI description: Calm photo spread.");
    expect(prompt).toContain(outputLanguage === "de" ? "AI layout summary: Hero, dann ein Grid aus Zimmern." : "AI layout summary: Hero, then a room grid.");
    expect(prompt).toContain("Kupferorange nur für Buchen");
    const stored = await callServerFunction<typeof getBrandKit>(browser, await app.serverFunctionUrl(file, "getBrandKit"), { slug: kitSlug });
    expect(stored.designBriefing).toBeNull();
  });

  it("says so when the model fails, without a key, and for an unknown kit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await draftKitBriefing({ slug: kitSlug, outputLanguage: "de" }, () => Promise.reject(new Error("overloaded")))).toEqual({ ok: false, reason: "failed" });

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const draft = await app.serverFunctionUrl(file, "draftBrandKitDesignBriefing");
    expect(await callServerFunction<typeof draftBrandKitDesignBriefing>(browser, draft, { slug: kitSlug }, "POST")).toEqual({
      ok: false,
      reason: "disabled",
    });
    await expect(callServerFunction<typeof draftBrandKitDesignBriefing>(browser, draft, { slug: `weg-${run}` }, "POST")).rejects.toEqual(
      expect.objectContaining({ isNotFound: true }),
    );
  });
});
