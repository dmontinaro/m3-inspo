/**
 * A Brand Kit's typography (#68), through the server functions the kit page
 * and the pairing pages call: taken over from a pairing as a copy, set
 * directly, removed, kept as a pairing, duplicated, and what deleting the
 * origin pairing leaves. Pairings share one database with other test files
 * and refuse duplicate families, so every family here carries this file's
 * run marker.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildColorScheme } from "@m3-inspo/shared/color-scheme";
import type { FontRoles, RoleFont, Typography } from "@m3-inspo/shared/fonts";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type {
  duplicateBrandKit,
  getBrandKit,
  keepBrandKitTypography,
  saveBrandKit,
  saveBrandKitChanges,
  setBrandKitStatus,
} from "./server/brand-kits.functions";
import type { ColorSchemeInput } from "./server/brand-kits.server";
import type { addTypePairing, deleteTypePairing, getTypePairing, updateTypePairing } from "./server/type-pairings.functions";

const owner: GithubAccount = { id: 6868, login: "kit-typography-owner", name: "Alex", email: "kit-typography-owner@example.com" };
const run = randomUUID().slice(0, 8);

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({ OWNER_GITHUB_ID: String(owner.id) });
  browser = app.browser();
  browser.setCookie("PARAGLIDE_LOCALE", "de");
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const kits = (name: string) => app.serverFunctionUrl("/src/server/brand-kits.functions.ts", name);
const pairings = (name: string) => app.serverFunctionUrl("/src/server/type-pairings.functions.ts", name);

/** A Fontsource family of this run, so no other pairing has it. */
const fontsource = (family: string, weights: number[]): RoleFont => ({
  family: `${family} ${run}`,
  weights,
  category: "sans",
  source: "fontsource",
  fontsourceId: `${family.toLowerCase().replaceAll(" ", "-")}-${run}`,
});

const scheme: ColorSchemeInput = {
  sources: {
    brand: { hex: "#ff6b35", lock: "exact", origin: { kind: "manual" } },
    neutral: { hex: "#2d3142", lock: "exact", origin: { kind: "manual" } },
    extras: [],
  },
  primary: "vivid",
};

async function newKit(name: string) {
  const result = await callServerFunction<typeof saveBrandKit>(browser, await kits("saveBrandKit"), { name: `${name} ${run}`, project: "", scheme }, "POST");
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.slug;
}

const load = async (slug: string) => callServerFunction<typeof getBrandKit>(browser, await kits("getBrandKit"), { slug });

/** "Speichern" on the kit page: the unchanged Color Scheme with this typography. */
const saveTypography = async (slug: string, typography: Typography | null) =>
  callServerFunction<typeof saveBrandKitChanges>(browser, await kits("saveBrandKitChanges"), { slug, scheme, typography }, "POST");

async function newPairing(name: string, roles: FontRoles) {
  const result = await callServerFunction<typeof addTypePairing>(browser, await pairings("addTypePairing"), { name, note: "", roles }, "POST");
  if (result.status !== "saved") throw new Error(JSON.stringify(result));
  return callServerFunction<typeof getTypePairing>(browser, await pairings("getTypePairing"), { slug: result.slug });
}

/** What the kit page saves after "In Brand Kit übernehmen": the pairing's roles with the pairing as origin. */
const takenOver = (pairing: { id: string; roles: FontRoles }): Typography => ({
  roles: pairing.roles,
  originPairingId: pairing.id,
  originPairingDeleted: false,
  scale: null,
});

describe("taking over a pairing", () => {
  it("copies its roles: editing the pairing afterwards leaves the kit unchanged", async () => {
    const roles = { heading: fontsource("Bricolage Grotesque", [600, 700]), body: fontsource("Figtree", [400]) };
    const pairing = await newPairing(`Warm ${run}`, roles);
    const slug = await newKit("Übernommen");
    await saveTypography(slug, takenOver(pairing));

    const edited = { ...roles, heading: fontsource("Fraunces", [700]) };
    await callServerFunction<typeof updateTypePairing>(browser, await pairings("updateTypePairing"), { slug: pairing.slug, name: pairing.name, note: "", roles: edited }, "POST");

    const kit = await load(slug);
    expect(kit.typography).toEqual(takenOver(pairing));
    expect(kit.typographyOrigin).toMatchObject({ slug: pairing.slug, roles: { heading: { family: `Fraunces ${run}` } } });
  });

  it("survives the pairing's deletion with every value; the origin then reads deleted", async () => {
    const pairing = await newPairing(`Vergänglich ${run}`, { heading: fontsource("Syne", [700]), body: fontsource("Karla", [400]) });
    const slug = await newKit("Überlebt");
    await saveTypography(slug, takenOver(pairing));
    const before = await load(slug);

    await callServerFunction<typeof deleteTypePairing>(browser, await pairings("deleteTypePairing"), { slug: pairing.slug }, "POST");

    const kit = await load(slug);
    expect(kit.typography).toEqual({ ...takenOver(pairing), originPairingId: null, originPairingDeleted: true });
    expect(kit.typographyOrigin).toBeNull();
    expect(kit.updatedAt).toEqual(before.updatedAt);
  });

  it("stores a taken-over pairing deleted before the save as from a deleted pairing", async () => {
    const slug = await newKit("Zu spät");

    const gone = { id: randomUUID(), roles: { heading: fontsource("Late", [700]), body: fontsource("Later", [400]) } };

    const { typography } = await saveTypography(slug, takenOver(gone));

    expect(typography).toMatchObject({ originPairingId: null, originPairingDeleted: true });
  });
});

describe("setting and removing fonts directly", () => {
  it("stores roles without a pairing, and removing them leaves the kit without typography", async () => {
    const slug = await newKit("Direkt");
    const roles = { heading: fontsource("Space Grotesk", [700]), body: fontsource("Inter", [400, 500]), mono: fontsource("JetBrains Mono", [400]) };

    await saveTypography(slug, { roles, originPairingId: null, originPairingDeleted: false, scale: null });
    expect((await load(slug)).typography).toEqual({ roles, originPairingId: null, originPairingDeleted: false, scale: null });

    await saveTypography(slug, null);
    const kit = await load(slug);
    expect(kit.typography).toBeNull();
    expect(kit.colorScheme).toEqual({ ...scheme, snapshot: buildColorScheme(scheme.sources, "vivid") });
  });

  it("turns away roles without a body font", async () => {
    const slug = await newKit("Ohne Fließtext");
    const roles = { heading: fontsource("Lonely", [700]) };

    await expect(saveTypography(slug, { roles, originPairingId: null, originPairingDeleted: false, scale: null } as unknown as Typography)).rejects.toThrow();
    expect((await load(slug)).typography).toBeNull();
  });
});

describe("Als Pairing merken", () => {
  it("keeps the kit's fonts as a pairing with the kit as origin, which becomes the typography's origin; a second time is a duplicate", async () => {
    const slug = await newKit("Gemerkt");
    const roles = { heading: fontsource("Outfit", [800]), body: fontsource("Nunito", [400]) };
    await saveTypography(slug, { roles, originPairingId: null, originPairingDeleted: false, scale: null });
    const keep = async () => callServerFunction<typeof keepBrandKitTypography>(browser, await kits("keepBrandKitTypography"), { slug }, "POST");

    const result = await keep();
    if (result.status !== "saved") throw new Error(JSON.stringify(result));
    const pairing = await callServerFunction<typeof getTypePairing>(browser, await pairings("getTypePairing"), { slug: result.slug });
    expect(pairing).toMatchObject({ name: `Gemerkt ${run}`, roles, origin: { kind: "brand_kit", brandKit: { slug, name: `Gemerkt ${run}` } } });

    const kit = await load(slug);
    expect(kit.typography).toEqual({ roles, originPairingId: pairing.id, originPairingDeleted: false, scale: null });
    expect(kit.typographyOrigin).toMatchObject({ slug: result.slug, roles });

    expect(await keep()).toEqual({ status: "duplicate", pairing: { slug: result.slug, name: `Gemerkt ${run}` } });
  });
});

describe("the kit's lifecycle", () => {
  it("copies the typography when duplicating", async () => {
    const slug = await newKit("Vorlage");
    const typography = { roles: { heading: fontsource("Sora", [600]), body: fontsource("Mulish", [400]) }, originPairingId: null, originPairingDeleted: false, scale: null };
    await saveTypography(slug, typography);

    const copy = await callServerFunction<typeof duplicateBrandKit>(browser, await kits("duplicateBrandKit"), { slug }, "POST");

    expect((await load(copy.slug)).typography).toEqual(typography);
  });

  it("warns on an approved kit's page that saving reaches agents, also for a change of fonts alone", async () => {
    const pairing = await newPairing(`Freigegeben ${run}`, { heading: fontsource("Epilogue", [700]), body: fontsource("Lexend", [400]) });
    const slug = await newKit("Freigegeben");
    await callServerFunction<typeof setBrandKitStatus>(browser, await kits("setBrandKitStatus"), { slug, status: "approved" }, "POST");

    const html = await (await browser.get(`/brand-kits/${slug}?pairing=${pairing.slug}`)).text();

    expect(html).toContain("Ungespeicherte Änderungen");
    expect(html).toContain("Dieses Kit ist freigegeben, Agenten sehen die Änderung sofort.");
    expect(html).toContain(`Epilogue ${run}`);
  });
});

it("turns away deleting a pairing without the owner's session", async () => {
  await expect(callServerFunction(app.browser(), await pairings("deleteTypePairing"), { slug: "x" }, "POST")).rejects.toThrow(/401/);
});
