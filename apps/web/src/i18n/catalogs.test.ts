import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as m from "../paraglide/messages.js";
import * as taxonomy from "@m3-inspo/taxonomy";
import * as labels from "../lib/taxonomy-labels";
import { checkCatalogParity, parseCatalog } from "./catalog-guard";

const project = new URL("../../", import.meta.url);

describe("shipped message catalogs", () => {
  it("imports both real catalogs with the pinned plugin and identical complete contracts", async () => {
    const settings = z.object({ baseLocale: z.literal("en"), locales: z.tuple([z.literal("en"), z.literal("de")]), modules: z.tuple([z.literal("https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js")]), "plugin.inlang.messageFormat": z.object({ pathPattern: z.literal("./messages/{locale}.json") }) }).parse(JSON.parse(await readFile(new URL("project.inlang/settings.json", project), "utf8")));
    const sources = await Promise.all(settings.locales.map((locale) => readFile(new URL(settings["plugin.inlang.messageFormat"].pathPattern.replace("{locale}", locale), project), "utf8")));
    const [en, de] = sources;
    if (!en || !de) throw new Error("Missing locale");
    await checkCatalogParity(en, de);
    const packageJson: unknown = JSON.parse(await readFile(new URL("package.json", project), "utf8"));
    expect(z.object({ devDependencies: z.object({ "@inlang/plugin-message-format": z.literal("4.5.0"), "@inlang/paraglide-js": z.literal("2.29.3") }) }).safeParse(packageJson).success).toBe(true);
  });

  it.each([0, 1, 2, 1234])("renders generated plural declarations for %s", (count) => {
    const input = { count, formattedCount: String(count) };
    for (const locale of ["en", "de"] as const) {
      expect(m.reference_count(input, { locale })).toBe(`${count} ${locale === "en" ? (count === 1 ? "reference" : "references") : (count === 1 ? "Referenz" : "Referenzen")}`);
      expect(m.color_count(input, { locale })).not.toMatch(/[{}]/);
    }
  });

  it("keeps every taxonomy family complete in both generated catalogs", () => {
    const families = [
      [taxonomy.STYLES, labels.stylesLabels], [taxonomy.INDUSTRIES, labels.industriesLabels],
      [taxonomy.COMPONENTS, labels.componentsLabels], [taxonomy.COMPONENT_TYPES, labels.componentTypesLabels],
      [taxonomy.VIBES, labels.vibesLabels], [taxonomy.COLOR_WORDS, labels.colorWordsLabels],
      [taxonomy.MODES, labels.modesLabels], [taxonomy.TYPE_ROLES, labels.typeRolesLabels],
      [taxonomy.VIEWPORTS, labels.viewportsLabels], [taxonomy.CAPTURE_DEVICES, labels.captureDevicesLabels],
      [taxonomy.MACROSTRUCTURES, labels.macrostructuresLabels], [taxonomy.PAPER_BANDS, labels.paperBandsLabels],
      [taxonomy.DISPLAY_CLASSES, labels.displayClassesLabels], [taxonomy.ACCENT_HUE_BANDS, labels.accentHueBandsLabels],
    ] as const;
    for (const [keys, mapping] of families) {
      expect(Object.keys(mapping).sort()).toEqual([...keys].sort());
      for (const message of Object.values(mapping)) for (const locale of ["en", "de"] as const) expect(message({}, { locale }).trim()).not.toBe("");
    }
  });
});

describe("catalog guard failures", () => {
  const simple = JSON.stringify({ greeting: "Hello {name}" });
  it("rejects missing locale entries and mismatched inputs", async () => {
    await expect(checkCatalogParity(simple, "{}")).rejects.toThrow();
    await expect(checkCatalogParity(simple, JSON.stringify({ greeting: "Hallo {other}" }))).rejects.toThrow();
  });
  it("rejects duplicate keys, malformed JSON, nested objects and blank text", () => {
    for (const source of ['{"greeting":"one","greeting":"two"}', '{"greeting":}', '{"greeting":{"text":"hi"}}', '{"greeting":" "}']) expect(() => parseCatalog(source)).toThrow();
  });
  it.each(["Hello {name", "Hello name}", "Hello {bad name}", "Hello {name: unsupported}"])("rejects invalid message syntax %s even when both catalogs agree", async (text) => {
    const source = JSON.stringify({ greeting: text });
    await expect(checkCatalogParity(source, source)).rejects.toThrow();
  });
  it("rejects an implicitly inferred complex parameter", async () => {
    const source = JSON.stringify({ greeting: [{ declarations: ["input name"], match: { "*": "Hello {other}" } }] });
    await expect(checkCatalogParity(source, source)).rejects.toThrow();
  });
  it("requires a joint fallback for multiple plural selectors", async () => {
    const source = (match: Record<string, string>) => JSON.stringify({ greeting: [{
      declarations: ["input first", "input second", "local a = first: plural", "local b = second: plural"],
      selectors: ["a", "b"],
      match,
    }] });
    const incomplete = source({ "a=one, b=*": "One first", "a=*, b=one": "One second" });
    await expect(checkCatalogParity(incomplete, incomplete)).rejects.toThrow("fallback");
    const complete = source({ "a=one, b=*": "One first", "a=*, b=one": "One second", "a=*, b=*": "Many of both" });
    await expect(checkCatalogParity(complete, complete)).resolves.toBeDefined();
  });
  it("rejects blank branches, undeclared references and missing plural catchall", async () => {
    const message = (match: Record<string, string>) => JSON.stringify({ count_message: [{ declarations: ["input count", "local countPlural = count: plural"], selectors: ["countPlural"], match }] });
    await expect(checkCatalogParity(message({ "countPlural=one": " ", "countPlural=*": "Many" }), simple)).rejects.toThrow();
    await expect(checkCatalogParity(message({ "countPlural=one": "{unknown}", "countPlural=*": "Many" }), simple)).rejects.toThrow();
    const missing = message({ "countPlural=one": "One" });
    await expect(checkCatalogParity(missing, missing)).rejects.toThrow();
  });
});
