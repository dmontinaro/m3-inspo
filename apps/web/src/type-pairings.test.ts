/**
 * Type pairings by hand, through the server functions the "Schriften" pages
 * call: create, edit and read, optional mono, adobe and local families, the
 * duplicate check, the name made from the families when none is given and
 * the Zod check of the font roles on write.
 */

import { getDb } from "@m3-inspo/db/client";
import { typePairings } from "@m3-inspo/db/library-schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callServerFunction, startTestApp } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { RoleFont } from "#/lib/fonts";
import type {
  addTypePairing,
  getTypePairing,
  getTypePairings,
  updateTypePairing,
} from "./server/type-pairings.functions";

const owner: GithubAccount = { id: 6464, login: "pairings-owner", name: "Alex", email: "pairings-owner@example.com" };

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

const pairingsFile = "/src/server/type-pairings.functions.ts";

// Each test uses families of its own: pairings share one database across tests and files,
// and the duplicate check compares against all of them.
const fontsource = (family: string, weights: number[], category: RoleFont["category"] = "sans"): RoleFont => ({
  family,
  weights,
  category,
  source: "fontsource",
  fontsourceId: family.toLowerCase().replaceAll(" ", "-"),
});

/** Sends the pairing form as the page does; roles go unchecked so tests can send broken ones. */
async function save(fields: { name: string; note?: string; roles: unknown }, slug?: string) {
  const data = { note: "", ...fields, ...(slug ? { slug } : {}) };
  const name = slug ? "updateTypePairing" : "addTypePairing";
  const url = await app.serverFunctionUrl(pairingsFile, name);
  return callServerFunction<typeof addTypePairing | typeof updateTypePairing>(browser, url, data, "POST");
}

/** Creates a pairing and returns its slug. */
async function create(fields: { name: string; note?: string; roles: unknown }) {
  const result = await save(fields);
  if (result.status !== "saved") throw new Error(JSON.stringify(result));
  return result.slug;
}

async function pairing(slug: string) {
  const url = await app.serverFunctionUrl(pairingsFile, "getTypePairing");
  return callServerFunction<typeof getTypePairing>(browser, url, { slug });
}

async function listed() {
  return callServerFunction<typeof getTypePairings>(browser, await app.serverFunctionUrl(pairingsFile, "getTypePairings"));
}

describe("keeping a pairing by hand", () => {
  it("creates heading and body from the catalog, edits them and shows the pairing on its detail page", async () => {
    const heading = fontsource("Bricolage Grotesque", [700, 600, 700]);
    const body = fontsource("Figtree", [400, 500]);
    const slug = await create({ name: "Warm & zupackend", note: " Kandidat für Harbor ", roles: { heading, body } });

    expect(slug).toBe("warm-zupackend");
    expect(await pairing(slug)).toMatchObject({
      name: "Warm & zupackend",
      note: "Kandidat für Harbor",
      roles: { heading: { ...heading, weights: [600, 700] }, body },
      origin: { kind: "manual", reference: null },
      archived: false,
    });
    expect((await listed()).find((item) => item.slug === slug)).toMatchObject({ name: "Warm & zupackend" });

    const serif = fontsource("Fraunces Edit", [400], "serif");
    expect(await save({ name: "Warm, aber edel", note: "", roles: { heading: serif, body } }, slug)).toEqual({
      status: "saved",
      slug,
    });
    expect(await pairing(slug)).toMatchObject({ name: "Warm, aber edel", note: null, roles: { heading: serif, body } });
  });

  it("keeps mono optional: added, then removed again", async () => {
    const roles = { heading: fontsource("Space Grotesk", [700]), body: fontsource("IBM Plex Sans", [400]) };
    const mono = fontsource("IBM Plex Mono", [400], "mono");
    const slug = await create({ name: "Technisch nüchtern", roles: { ...roles, mono } });
    expect((await pairing(slug)).roles.mono).toEqual(mono);

    await save({ name: "Technisch nüchtern", roles }, slug);
    expect((await pairing(slug)).roles).not.toHaveProperty("mono");
  });

  it("allows one family for every role", async () => {
    const geist = (weights: number[]) => fontsource("Geist", weights);
    const slug = await create({ name: "Eine Familie", roles: { heading: geist([600]), body: geist([400]), mono: geist([400]) } });
    expect((await pairing(slug)).roles).toMatchObject({ heading: { family: "Geist" }, body: { family: "Geist" }, mono: { family: "Geist" } });
  });

  it("takes adobe and local families with the category chosen for them, and drops fields of other sources or the server", async () => {
    const adobe = { family: "Neue Haas Unica", weights: [500], category: "sans", source: "adobe", adobeSlug: "from-the-client" };
    const local = { family: "Söhne", weights: [400], category: "sans", source: "local", fontsourceId: "soehne", adobeSlug: "x" };
    const slug = await create({ name: "Söhne lokal", roles: { heading: adobe, body: local } });

    expect((await pairing(slug)).roles).toEqual({
      heading: { family: "Neue Haas Unica", weights: [500], category: "sans", source: "adobe" },
      body: { family: "Söhne", weights: [400], category: "sans", source: "local" },
    });
  });

  it.each(["Neu", "New"])("reserves the creation slug for %s", async (name) => {
    const slug = await create({ name, roles: { heading: fontsource(`${name} Heading`, [700]), body: fontsource(`${name} Body`, [400]) } });
    expect(slug).toMatch(new RegExp(`^${name.toLowerCase()}-.+`));
  });

  it("renders a legacy pairing named new independently of the creation form", async () => {
    await getDb().insert(typePairings).values({ slug: "new", name: "Legacy new pairing", roles: { heading: fontsource("Legacy Heading", [700]), body: fontsource("Legacy Body", [400]) } });
    const detail = await browser.get("/type-pairings/new/view");
    expect(detail.status).toBe(200);
    expect(await detail.text()).toMatch(/<h1\b[^>]*>Legacy new pairing<\/h1>/);
    const editor = await browser.get("/type-pairings/new/edit");
    expect(editor.status).toBe(200);
    expect(await editor.text()).toContain('value="Legacy new pairing"');
  });

  it("answers not found for an unknown slug", async () => {
    await expect(pairing("gibt-es-nicht")).rejects.toMatchObject({ isNotFound: true });
  });
});

describe("duplicates", () => {
  const kept = { heading: fontsource("Playfair Display", [700], "serif"), body: fontsource("Source Sans 3", [400, 600]) };

  it("refuses the same families in the same roles, whatever the weights, and saves nothing", async () => {
    const slug = await create({ name: "Hotel klassisch", roles: kept });

    const again = {
      heading: { ...kept.heading, family: "playfair display", weights: [400] },
      body: { ...kept.body, weights: [300] },
    };
    expect(await save({ name: "Hotel klassisch 2", roles: again })).toEqual({
      status: "duplicate",
      pairing: { slug, name: "Hotel klassisch" },
    });
    // Other test files add pairings to the same database meanwhile, so look for this one instead of counting.
    expect((await listed()).map((item) => item.name)).not.toContain("Hotel klassisch 2");
  });

  it("counts swapped roles and an added mono as a different combination", async () => {
    const swapped = await save({ name: "Vertauscht", roles: { heading: kept.body, body: kept.heading } });
    const withMono = await save({ name: "Mit Mono", roles: { ...kept, mono: fontsource("Fira Code", [400], "mono") } });
    expect([swapped.status, withMono.status]).toEqual(["saved", "saved"]);
  });

  it("refuses an edit that turns a pairing into another one, but saves a pairing unchanged", async () => {
    const roles = { heading: fontsource("Instrument Serif", [400], "serif"), body: fontsource("DM Sans", [400]) };
    const original = await create({ name: "Leise Serif", roles });
    const other = await create({ name: "Leise Sans", roles: { ...roles, body: fontsource("Inter Edit", [400]) } });

    expect(await save({ name: "Leise Serif", roles: { ...roles, heading: { ...roles.heading, weights: [400, 700] } } }, original)).toEqual({
      status: "saved",
      slug: original,
    });
    expect(await save({ name: "Leise Sans", roles }, other)).toMatchObject({ status: "duplicate", pairing: { slug: original } });
    expect((await pairing(other)).roles.body.family).toBe("Inter Edit");
  });
});

describe("checking the font roles on write", () => {
  const body = fontsource("Checked Body", [400]);

  it.each([
    ["heading is missing", { body }],
    ["a role has no weights", { heading: fontsource("Checked Heading", []), body }],
    ["a family name is empty", { heading: fontsource(" ", [700]), body }],
    ["a Fontsource family has no id", { heading: { ...fontsource("Checked Heading", [700]), fontsourceId: undefined }, body }],
    ["the source is unknown", { heading: { ...fontsource("Checked Heading", [700]), source: "google" }, body }],
    ["the category is unknown", { heading: { ...fontsource("Checked Heading", [700]), category: "slab" }, body }],
  ])("rejects the pairing when %s", async (_case, roles) => {
    const result = await save({ name: "Ungültig", roles });
    expect(result).toMatchObject({ status: "invalid", errors: { roles: [expect.any(String)] } });
    expect((await listed()).some((item) => item.name === "Ungültig")).toBe(false);
  });

  it("explains a missing heading and missing weights in German", async () => {
    expect(await save({ name: "Ungültig", roles: { body } })).toMatchObject({
      errors: { roles: ["Überschrift und Fließtext brauchen je eine Schrift."] },
    });
    expect(await save({ name: "Ungültig", roles: { heading: fontsource("Checked Heading", []), body } })).toMatchObject({
      errors: { roles: ["Jede Schrift braucht mindestens ein Gewicht."] },
    });
  });

});

describe("a pairing without a name", () => {
  it("is named after its families, each once, in role order", async () => {
    const roles = { heading: fontsource("Unnamed Serif", [700], "serif"), body: fontsource("Unnamed Sans", [400]) };
    const slug = await create({ name: "  ", roles: { ...roles, mono: fontsource("Unnamed Mono", [400], "mono") } });
    expect(slug).toBe("unnamed-serif-unnamed-sans-unnamed-mono");
    expect(await pairing(slug)).toMatchObject({ name: "Unnamed Serif + Unnamed Sans + Unnamed Mono" });

    await save({ name: "", roles: { heading: roles.heading, body: roles.heading } }, slug);
    expect(await pairing(slug)).toMatchObject({ name: "Unnamed Serif" });
  });
});
