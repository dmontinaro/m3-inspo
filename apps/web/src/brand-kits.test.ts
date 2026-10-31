/**
 * Brand Kits through the server functions the generator's "Speichern" and
 * the kit pages call, and how /brand-kits/$slug answers. Other test files
 * share the database, so this file's names carry its run marker.
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@m3-inspo/db/client";
import { brandKitReferences, brandKits, references } from "@m3-inspo/db/library-schema";
import { buildColorScheme, exportCss } from "@m3-inspo/shared/color-scheme";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type {
  deleteBrandKit,
  duplicateBrandKit,
  getBrandKit,
  getBrandKits,
  saveBrandKit,
  saveBrandKitChanges,
  setBrandKitStatus,
  updateBrandKitNotes,
  updateBrandKitDesignBriefing,
} from "./server/brand-kits.functions";
import type { deleteReference, setReferenceStatus } from "./server/library.functions";
import type { ColorSchemeInput } from "./server/brand-kits.server";

const owner: GithubAccount = { id: 4747, login: "brand-kits-owner", name: "Alex", email: "brand-kits-owner@example.com" };
const run = randomUUID().slice(0, 8);

let app: TestApp;
let browser: TestBrowser;
let hotel = { id: "", slug: "" };

/** The id of the row with this slug; fails the test if there is none. */
async function idOf(table: typeof references | typeof brandKits, slug: string) {
  const row = (await getDb().select({ id: table.id }).from(table).where(eq(table.slug, slug))).at(0);
  if (!row) throw new Error(`No row with slug ${slug}.`);
  return row.id;
}

/** How a server function answers an unknown slug. */
const notFound = expect.objectContaining({ isNotFound: true });

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  await signInWithGithub(browser, owner);
  const slug = await uploadScreenshot(app, browser, `Harbor App ${run}`);
  hotel = { id: await idOf(references, slug), slug };
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const file = "/src/server/brand-kits.functions.ts";
const url = (name: string) => app.serverFunctionUrl(file, name);

/** Harbor: the orange's hue locked, taken from the hotel reference; a rolled neutral and a teal set by hand. */
const harbor = (): ColorSchemeInput => ({
  sources: {
    brand: { hex: "#e56236", lock: "hue", origin: { kind: "reference", referenceId: hotel.id, measuredBy: "dom" } },
    neutral: { hex: "#8a7a72", lock: "open", origin: { kind: "rolled", seed: 7 } },
    extras: [{ name: "teal", hex: "#2f7d6d", lock: "exact", origin: { kind: "manual" } }],
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

async function save(name: string, scheme: ColorSchemeInput, project = "") {
  return callServerFunction<typeof saveBrandKit>(browser, await url("saveBrandKit"), { name, project, scheme }, "POST");
}

/** Saves a kit and returns its slug. */
async function saved(name: string, scheme: ColorSchemeInput, project = "") {
  const result = await save(name, scheme, project);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.slug;
}

const load = async (slug: string) => callServerFunction<typeof getBrandKit>(browser, await url("getBrandKit"), { slug });
const overwrite = async (slug: string, scheme: ColorSchemeInput) =>
  callServerFunction<typeof saveBrandKitChanges>(browser, await url("saveBrandKitChanges"), { slug, scheme, typography: null }, "POST");
const setStatus = async (slug: string, status: "draft" | "approved" | "archived") =>
  callServerFunction<typeof setBrandKitStatus>(browser, await url("setBrandKitStatus"), { slug, status }, "POST");

describe("saving", () => {
  it("creates a draft with a slug from the name, the snapshot built from the sources and the source references", async () => {
    const slug = await saved(`Harbor ${run}`, harbor(), "  Harbor ");

    expect(slug).toBe(`harbor-${run}`);
    const kit = await load(slug);
    expect(kit).toMatchObject({ name: `Harbor ${run}`, project: "harbor", status: "draft", notes: null, outdated: false });
    expect(kit.colorScheme).toEqual({ ...harbor(), snapshot: buildColorScheme(harbor().sources, "vivid") });
    expect(kit.sourceReferences).toEqual([
      {
        id: hotel.id,
        slug: hotel.slug,
        title: `Harbor App ${run}`,
        curationStatus: "approved",
        thumbUrl: expect.stringMatching(/^\/api\/assets\//),
      },
    ]);
  });

  it("gives a second kit of the same name a slug of its own", async () => {
    const first = await saved(`Zweitname ${run}`, violet());
    const second = await saved(`Zweitname ${run}`, violet());

    expect(second).not.toBe(first);
    expect(second.startsWith(`zweitname-${run}-`)).toBe(true);
  });

  it("asks for a name", async () => {
    expect(await save("   ", violet())).toEqual({ ok: false, errors: { name: ["Bitte gib einen Namen ein."] } });
  });

  it("drops the link to a reference that no longer exists; the colour stays", async () => {
    const scheme = harbor();
    scheme.sources.brand.origin = { kind: "reference", referenceId: randomUUID(), measuredBy: "vision" };

    const kit = await load(await saved(`Verschwunden ${run}`, scheme));

    expect(kit.colorScheme.sources.brand).toEqual({
      hex: "#e56236",
      lock: "hue",
      origin: { kind: "reference", referenceId: null, measuredBy: "vision" },
    });
    expect(kit.sourceReferences).toEqual([]);
  });

  it("answers an overwrite with the Color Scheme as stored, so the page can take it over", async () => {
    const slug = await saved(`Antwort ${run}`, violet());
    const scheme = harbor();
    scheme.sources.brand.origin = { kind: "reference", referenceId: randomUUID(), measuredBy: "dom" };

    const { colorScheme: stored } = await overwrite(slug, scheme);

    expect(stored).toEqual((await load(slug)).colorScheme);
    expect(stored.sources.brand.origin).toEqual({ kind: "reference", referenceId: null, measuredBy: "dom" });
  });

  const extra = (name: string) => ({ name, hex: "#2f7d6d", lock: "exact" as const, origin: { kind: "manual" as const } });

  it.each<[string, (scheme: ColorSchemeInput) => void]>([
    ["a broken hex", (scheme) => void (scheme.sources.brand.hex = "#e5623")],
    ["an unknown lock", (scheme) => void Object.assign(scheme.sources.neutral, { lock: "half" })],
    ["six extras", (scheme) => void (scheme.sources.extras = ["teal", "lime", "sky", "rose", "amber", "stone"].map(extra))],
    ["an extra named like a role", (scheme) => void (scheme.sources.extras = [extra("primary")])],
    ["two extras of one name", (scheme) => void (scheme.sources.extras = [extra("teal"), extra("teal")])],
    ["an unknown strategy", (scheme) => void Object.assign(scheme, { primary: "loud" })],
  ])("turns away a Color Scheme with %s, on saving and on overwriting", async (_, spoil) => {
    const slug = await saved(`Unberührt ${run} ${randomUUID().slice(0, 4)}`, harbor());
    const before = (await load(slug)).colorScheme;
    const scheme = harbor();
    spoil(scheme);

    await expect(save(`Kaputt ${run}`, scheme)).rejects.toThrow();
    await expect(overwrite(slug, scheme)).rejects.toThrow();
    expect((await load(slug)).colorScheme).toEqual(before);
  });
});

describe("overwriting", () => {
  it("replaces the snapshot and the source references with the new sources", async () => {
    const slug = await saved(`Überschreiben ${run}`, harbor(), "harbor");

    await overwrite(slug, violet());

    const kit = await load(slug);
    expect(kit.colorScheme).toEqual({ ...violet(), snapshot: buildColorScheme(violet().sources, "hold") });
    expect(kit.sourceReferences).toEqual([]);
    expect(kit).toMatchObject({ name: `Überschreiben ${run}`, project: "harbor", status: "draft" });
  });

  it("is the only thing that changes the snapshot: notes and loading leave it as stored", async () => {
    const slug = await saved(`Notizen ${run}`, harbor());
    const before = (await load(slug)).colorScheme;

    const notes = "Orange nur für Haupt-Aktionen.\nNie als Fläche.";
    await callServerFunction<typeof updateBrandKitNotes>(browser, await url("updateBrandKitNotes"), { slug, notes }, "POST");

    const kit = await load(slug);
    expect(kit.notes).toBe(notes);
    expect(kit.colorScheme).toEqual(before);
  });

  it("answers an unknown kit with not found", async () => {
    await expect(overwrite(`gibt-es-nicht-${run}`, violet())).rejects.toEqual(notFound);
    await expect(load(`gibt-es-nicht-${run}`)).rejects.toEqual(notFound);
  });
});

describe("the design briefing", () => {
  const briefing = "# Harbor\n\n## Hotelangebote\n\n- Mehr Hotelfotos statt Kennzahl-Kacheln.\n- Erledigte Anfragen standardmäßig einklappen.\n";
  const update = async (slug: string, designBriefing: string) =>
    callServerFunction<typeof updateBrandKitDesignBriefing>(browser, await url("updateBrandKitDesignBriefing"), { slug, designBriefing }, "POST");

  it("keeps Markdown verbatim per kit, independently of colours and notes, and copies it into a draft", async () => {
    const slug = await saved(`Briefing ${run}`, harbor(), "harbor");
    const other = await saved(`Anderes Briefing ${run}`, violet(), "sample-studio");
    const before = await load(slug);
    expect(before.designBriefing).toBeNull();
    await update(slug, briefing);
    const kit = await load(slug);
    expect(kit.designBriefing).toBe(briefing);
    expect(kit.colorScheme).toEqual(before.colorScheme);
    expect(kit.notes).toBeNull();
    expect((await load(other)).designBriefing).toBeNull();
    await overwrite(slug, violet());
    expect((await load(slug)).designBriefing).toBe(briefing);
    const copy = await callServerFunction<typeof duplicateBrandKit>(browser, await url("duplicateBrandKit"), { slug }, "POST");
    expect(await load(copy.slug)).toMatchObject({ status: "draft", designBriefing: briefing });
    const html = await (await browser.get(`/brand-kits/${slug}`)).text();
    expect(html).toContain("Design-Briefing");
    expect(html).toContain("DESIGN.md herunterladen");
    expect(html).toContain(encodeURIComponent(briefing));
  });

  it("clears whitespace-only content and rejects oversized input and unknown kits", async () => {
    const slug = await saved(`Briefing Grenzen ${run}`, violet());
    await update(slug, briefing);
    await expect(update(slug, "x".repeat(40_001))).rejects.toThrow();
    expect((await load(slug)).designBriefing).toBe(briefing);
    await expect(update(`fehlt-${run}`, briefing)).rejects.toEqual(notFound);
    await update(slug, "  \n\t");
    expect((await load(slug)).designBriefing).toBeNull();
  });
});

describe("a kit the generator now computes differently", () => {
  /** A kit whose stored snapshot an older generator built: its primary differs from today's. */
  async function outdatedKit(name: string) {
    const slug = await saved(name, harbor());
    await getDb()
      .update(brandKits)
      .set({ colorScheme: sql`jsonb_set(${brandKits.colorScheme}, '{snapshot,roles,primary,hex}', '"#c2410c"')` })
      .where(eq(brandKits.slug, slug));
    return slug;
  }

  it("is flagged on loading, and its CSS still comes from the stored snapshot", async () => {
    const kit = await load(await outdatedKit(`Veraltet ${run}`));

    expect(kit.outdated).toBe(true);
    expect(kit.colorScheme.snapshot.roles.primary.hex).toBe("#c2410c");
    expect(kit.css.tailwind).toBe(exportCss(kit.colorScheme.snapshot));
    expect(kit.css.css).toBe(exportCss(kit.colorScheme.snapshot, "css"));
    expect(kit.css.tailwind).not.toBe(exportCss(buildColorScheme(kit.colorScheme.sources, kit.colorScheme.primary)));
  });

  it("is not flagged for a contrast ratio that moved in the last digit only", async () => {
    const slug = await saved(`Rundung ${run}`, harbor());
    const ratio = (await load(slug)).colorScheme.snapshot.roles["primary-foreground"].contrast?.ratio ?? 0;
    await getDb()
      .update(brandKits)
      .set({
        colorScheme: sql`jsonb_set(${brandKits.colorScheme}, '{snapshot,roles,primary-foreground,contrast,ratio}', ${JSON.stringify(ratio - 0.01)}::jsonb)`,
      })
      .where(eq(brandKits.slug, slug));

    expect((await load(slug)).outdated).toBe(false);
  });

  it("says so on its page", async () => {
    const html = await (await browser.get(`/brand-kits/${await outdatedKit(`Veraltet Seite ${run}`)}`)).text();

    expect(html).toContain("Der Generator liefert inzwischen andere Werte. Speichern übernimmt sie.");
  });

  it("warns on an approved kit that saving reaches agents, also when saving only takes over the new values", async () => {
    const slug = await outdatedKit(`Veraltet Freigegeben ${run}`);
    await setStatus(slug, "approved");

    const html = await (await browser.get(`/brand-kits/${slug}`)).text();

    expect(html).not.toContain("Ungespeicherte Änderungen");
    expect(html).toContain("Dieses Kit ist freigegeben, Agenten sehen die Änderung sofort.");
  });

  it("takes today's values when saved", async () => {
    const slug = await outdatedKit(`Veraltet Speichern ${run}`);

    await overwrite(slug, harbor());

    const kit = await load(slug);
    expect(kit.outdated).toBe(false);
    expect(kit.colorScheme.snapshot).toEqual(buildColorScheme(harbor().sources, "vivid"));
  });
});

describe("the kit page", () => {
  it("shows the saved state without colour parameters, unsaved changes with them", async () => {
    const slug = await saved(`Seite ${run}`, harbor(), "harbor");

    const plain = await (await browser.get(`/brand-kits/${slug}?pool=project:harbor`)).text();
    expect(plain).toContain(`Seite ${run}`);
    expect(plain).toContain("e56236");
    expect(plain).not.toContain("Ungespeicherte Änderungen");

    const changed = await (await browser.get(`/brand-kits/${slug}?brand=2f7d6d~exact&neutral=8a7a72&seed=3`)).text();
    expect(changed).toContain("Ungespeicherte Änderungen");
    expect(changed).toContain("2f7d6d");
  });

  it("answers an unknown kit with a page of its own", async () => {
    const response = await browser.get(`/brand-kits/gibt-es-nicht-${run}`);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Brand Kit nicht gefunden");
  });
});

describe("approving", () => {
  it("lets one kit apply to its project: approving a second resets the first to draft and names it beforehand", async () => {
    const project = `freigabe-${run}`;
    const first = await saved(`Erste Freigabe ${run}`, harbor(), project);
    const second = await saved(`Zweite Freigabe ${run}`, violet(), project);
    await setStatus(first, "approved");

    expect((await load(second)).approvedInProject).toEqual({ slug: first, name: `Erste Freigabe ${run}` });
    expect((await load(first)).approvedInProject).toBeNull();

    await setStatus(second, "approved");

    expect((await load(first)).status).toBe("draft");
    expect((await load(second)).status).toBe("approved");
  });

  it("is guarded by the database: two approved kits of one project cannot be stored", async () => {
    const project = `doppelt-${run}`;
    await saved(`Doppelt A ${run}`, harbor(), project);
    await saved(`Doppelt B ${run}`, violet(), project);

    await expect(getDb().update(brandKits).set({ status: "approved" }).where(eq(brandKits.project, project))).rejects.toThrow();
  });

  it("lets any number of kits without a project be approved", async () => {
    const a = await saved(`Ohne Projekt A ${run}`, harbor());
    const b = await saved(`Ohne Projekt B ${run}`, violet());

    await setStatus(a, "approved");
    await setStatus(b, "approved");

    expect((await load(a)).status).toBe("approved");
    expect((await load(b)).status).toBe("approved");
    expect((await load(b)).approvedInProject).toBeNull();
  });

  it("brings an archived kit back as a draft", async () => {
    const slug = await saved(`Archiv ${run}`, harbor(), "harbor");
    await setStatus(slug, "archived");
    expect((await load(slug)).status).toBe("archived");

    await setStatus(slug, "draft");

    expect((await load(slug)).status).toBe("draft");
  });

  it("answers an unknown kit with not found", async () => {
    await expect(setStatus(`gibt-es-nicht-${run}`, "approved")).rejects.toEqual(notFound);
  });
});

describe("duplicating", () => {
  it("makes a draft copy with a slug of its own and the same project, Color Scheme, notes and source references", async () => {
    const slug = await saved(`Vorlage ${run}`, harbor(), "harbor");
    await callServerFunction<typeof updateBrandKitNotes>(browser, await url("updateBrandKitNotes"), { slug, notes: "Orange nur für Aktionen." }, "POST");
    await setStatus(slug, "approved");
    const original = await load(slug);

    const copy = await callServerFunction<typeof duplicateBrandKit>(browser, await url("duplicateBrandKit"), { slug }, "POST");

    expect(copy.slug).not.toBe(slug);
    const kit = await load(copy.slug);
    expect(kit).toMatchObject({ name: `Vorlage ${run} (Kopie)`, project: "harbor", status: "draft", notes: "Orange nur für Aktionen." });
    expect(kit.colorScheme).toEqual(original.colorScheme);
    expect(kit.sourceReferences).toEqual(original.sourceReferences);
    expect((await load(slug)).status).toBe("approved");
  });
});

describe("deleting", () => {
  it("removes a kit with its links to source references; the references stay", async () => {
    const slug = await saved(`Weg ${run}`, harbor());
    const kitId = await idOf(brandKits, slug);
    const links = () => getDb().query.brandKitReferences.findMany({ where: eq(brandKitReferences.brandKitId, kitId) });
    expect(await links()).toHaveLength(1);

    await callServerFunction<typeof deleteBrandKit>(browser, await url("deleteBrandKit"), { slug }, "POST");

    await expect(load(slug)).rejects.toEqual(notFound);
    expect(await links()).toEqual([]);
    expect(await getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.id, hotel.id) })).toEqual({ id: hotel.id });
  });

  it("keeps an archived source reference linked and reports it as archived", async () => {
    const referenceSlug = await uploadScreenshot(app, browser, `Archiviert ${run}`);
    const scheme = harbor();
    const origin = { kind: "reference" as const, referenceId: await idOf(references, referenceSlug), measuredBy: "image" as const };
    scheme.sources.brand.origin = origin;
    const slug = await saved(`Quelle archiviert ${run}`, scheme);

    await callServerFunction<typeof setReferenceStatus>(
      browser,
      await app.serverFunctionUrl("/src/server/library.functions.ts", "setReferenceStatus"),
      { slug: referenceSlug, status: "archived" },
      "POST",
    );

    const kit = await load(slug);
    expect(kit.sourceReferences).toMatchObject([{ slug: referenceSlug, curationStatus: "archived" }]);
    expect(kit.colorScheme.sources.brand.origin).toEqual(origin);
  });

  it("of a source reference succeeds; the kit keeps its snapshot and says the colours come from a deleted reference", async () => {
    const referenceSlug = await uploadScreenshot(app, browser, `Gelöscht ${run}`);
    const scheme = harbor();
    const origin = { kind: "reference" as const, referenceId: await idOf(references, referenceSlug), measuredBy: "image" as const };
    scheme.sources.brand.origin = origin;
    scheme.sources.extras[0].origin = origin;
    const slug = await saved(`Quelle gelöscht ${run}`, scheme);
    const before = await load(slug);

    await callServerFunction<typeof deleteReference>(
      browser,
      await app.serverFunctionUrl("/src/server/library.functions.ts", "deleteReference"),
      { slug: referenceSlug },
      "POST",
    );

    const kit = await load(slug);
    expect(kit.colorScheme.snapshot).toEqual(before.colorScheme.snapshot);
    expect(kit.outdated).toBe(false);
    expect(kit.sourceReferences).toEqual([]);
    expect(kit.colorScheme.sources.brand.origin).toEqual({ ...origin, referenceId: null });
    expect(kit.colorScheme.sources.extras[0].origin).toEqual({ ...origin, referenceId: null });
    expect(kit.colorScheme.sources.neutral).toEqual(before.colorScheme.sources.neutral);
  });
});

describe("the list", () => {
  it("names every kit with project, status and colours", async () => {
    const slug = await saved(`Liste ${run}`, harbor(), "harbor");

    const kits = await callServerFunction<typeof getBrandKits>(browser, await url("getBrandKits"));

    expect(kits.find((kit) => kit.slug === slug)).toMatchObject({
      name: `Liste ${run}`,
      project: "harbor",
      status: "draft",
      colors: {
        brand: "#e56236",
        neutral: "#8a7a72",
        extras: [{ name: "teal", hex: "#2f7d6d" }],
        primary: buildColorScheme(harbor().sources, "vivid").roles.primary.hex,
        onPrimary: "#ffffff",
      },
    });
  });
});

describe("without the owner's session", () => {
  it.each([
    ["getBrandKits", undefined, "GET"],
    ["getBrandKit", { slug: "x" }, "GET"],
    ["saveBrandKit", { name: "x", project: "", scheme: violet() }, "POST"],
    ["saveBrandKitChanges", { slug: "x", scheme: violet(), typography: null }, "POST"],
    ["keepBrandKitTypography", { slug: "x" }, "POST"],
    ["updateBrandKitNotes", { slug: "x", notes: "" }, "POST"],
    ["updateBrandKitDesignBriefing", { slug: "x", designBriefing: "" }, "POST"],
    ["setBrandKitStatus", { slug: "x", status: "approved" }, "POST"],
    ["duplicateBrandKit", { slug: "x" }, "POST"],
    ["deleteBrandKit", { slug: "x" }, "POST"],
  ] as const)("%s is turned away", async (name, data, method) => {
    await expect(callServerFunction(app.browser(), await url(name), data, method)).rejects.toThrow(/401/);
  });

  it("the kit pages send to sign-in", async () => {
    expect((await app.browser().get("/brand-kits")).status).toBe(307);
    expect((await app.browser().get(`/brand-kits/harbor-${run}`)).status).toBe(307);
  });
});
