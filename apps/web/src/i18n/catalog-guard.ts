import ts from "typescript";
import { z } from "zod";
import plugin from "@inlang/plugin-message-format";

const text = z.string().trim().min(1).refine((value) => !/\bTODO\b/.test(value));
const complex = z.strictObject({
  declarations: z.array(text).optional(),
  selectors: z.array(text).optional(),
  match: z.record(text, text).refine((value) => Object.keys(value).length > 0),
});
const catalog = z.record(z.string().regex(/^(?:\$schema|[a-z][a-z0-9]*(?:_[a-z0-9]+)*)$/), z.union([text, z.tuple([complex])]));

/** JSON.parse is intentionally preceded by a duplicate-key check on TypeScript's JSON AST. */
export function parseCatalog(source: string) {
  const file = ts.parseJsonText("messages.json", source);
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set<string>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) throw new Error("Invalid JSON property");
        if (seen.has(property.name.text)) throw new Error(`Duplicate key: ${property.name.text}`);
        seen.add(property.name.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const checked = catalog.parse(JSON.parse(source));
  for (const [id, value] of Object.entries(checked)) {
    if (id === "$schema") continue;
    for (const pattern of typeof value === "string" ? [value] : Object.values(value[0].match)) {
      let depth = 0;
      for (let index = 0; index < pattern.length; index++) {
        const character = pattern[index];
        if (character === "\\") { index++; continue; }
        if (character === "{") depth++;
        if (character === "}") depth--;
        if (depth < 0 || depth > 1) throw new Error(`Malformed message ${id}`);
      }
      if (depth !== 0) throw new Error(`Unclosed message expression ${id}`);
    }
  }
  return checked;
}

/** Import each locale separately so merging/fallback cannot hide missing declarations or branches. */
export async function importCatalog(source: string, locale: string) {
  const checked = parseCatalog(source);
  if (!plugin.importFiles) throw new Error("Message format plugin has no importer");
  const imported = await plugin.importFiles({ files: [{ locale, content: new TextEncoder().encode(source) }], settings: { baseLocale: "en", locales: ["en", "de"] } });
  const expected = Object.keys(checked).filter((key) => key !== "$schema").sort();
  if (JSON.stringify(imported.bundles.map((bundle) => bundle.id).sort()) !== JSON.stringify(expected)) throw new Error("Importer lost message IDs");
  for (const bundle of imported.bundles) {
    const known = new Set((bundle.declarations ?? []).map((declaration) => declaration.name));
    const message = imported.messages.find((item) => item.bundleId === bundle.id);
    if (!message) throw new Error(`Missing imported message ${bundle.id}`);
    const variants = imported.variants.filter((variant) => variant.messageBundleId === bundle.id);
    if (!bundle.id) throw new Error("Missing bundle ID");
    const raw = checked[bundle.id];
    if (Array.isArray(raw) && (bundle.declarations ?? []).length !== (raw[0].declarations ?? []).length) throw new Error(`Undeclared parameter in ${bundle.id}`);
    const expectedVariants = Array.isArray(raw) ? Object.keys(raw[0].match).length : 1;
    if (variants.length !== expectedVariants) throw new Error(`Importer lost variants of ${bundle.id}`);
    function references(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("annotation" in value && value.annotation && typeof value.annotation === "object" && "name" in value.annotation && !["plural", "number", "datetime"].includes(String(value.annotation.name))) throw new Error(`Unknown annotation in ${bundle.id}`);
      if ("type" in value && value.type === "variable-reference" && "name" in value && typeof value.name === "string" && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.name)) throw new Error(`Invalid parameter ${value.name}`);
      if ("type" in value && value.type === "variable-reference" && "name" in value && typeof value.name === "string" && !known.has(value.name)) throw new Error(`Unknown parameter ${value.name}`);
      for (const child of Object.values(value)) references(child);
    }
    references(bundle.declarations);
    references(message.selectors);
    for (const variant of variants) {
      references(variant.pattern);
      if (!(variant.pattern ?? []).some((part) => part.type !== "text" || part.value.trim())) throw new Error(`Empty variant ${bundle.id}`);
      for (const match of variant.matches ?? []) if (!known.has(match.key)) throw new Error(`Unknown selector ${match.key}`);
    }
    const selectors = message.selectors ?? [];
    if (selectors.length > 0 && !variants.some((variant) => selectors.every((selector) =>
      variant.matches?.some((match) => match.key === selector.name && match.type === "catchall-match"),
    ))) throw new Error(`Missing joint selector fallback in ${bundle.id}`);
    for (const declaration of bundle.declarations ?? []) {
      if (declaration.type !== "local-variable" || declaration.value.annotation?.name !== "plural") continue;
      if (!(message.selectors ?? []).some((selector) => selector.name === declaration.name)) throw new Error(`Missing plural selector ${bundle.id}`);
      const matches = variants.flatMap((variant) => (variant.matches ?? []).filter((match) => match.key === declaration.name));
      if (!matches.some((match) => match.type === "literal-match" && match.value === "one") || !matches.some((match) => match.type === "catchall-match")) throw new Error(`Incomplete plural ${bundle.id}`);
    }
  }
  return imported;
}

export async function checkCatalogParity(en: string, de: string) {
  const [first, second] = await Promise.all([importCatalog(en, "en"), importCatalog(de, "de")]);
  function contract(imported: typeof first) {
    return imported.bundles.map((bundle) => ({
      id: bundle.id,
      declarations: [...bundle.declarations ?? []].sort((a, b) => a.name.localeCompare(b.name)),
      selectors: imported.messages.find((message) => message.bundleId === bundle.id)?.selectors,
      variants: imported.variants.filter((variant) => variant.messageBundleId === bundle.id).map((variant) => variant.matches).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })).sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  }
  if (JSON.stringify(contract(first)) !== JSON.stringify(contract(second))) throw new Error("Locale message contracts differ");
  return first;
}
