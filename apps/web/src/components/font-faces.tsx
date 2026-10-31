import { useEffect, useSyncExternalStore } from "react";
import { fallbackStacks } from "@m3-inspo/shared/fonts";
import { adobeCssName, adobeKitStylesheetUrl, fontCategoryLabels, fontsourceFileUrl } from "#/lib/fonts";
import type { RoleFont } from "#/lib/fonts";
import { getAdobePreviewKitId } from "#/server/adobe-fonts.functions";

/**
 * Font loading for the type pairing previews, once per page view. Fontsource
 * weights load from jsDelivr through `FontFace`. Adobe families come from
 * the preview kit's stylesheet (server/adobe-fonts.server.ts), added to the
 * page on first use. Until a weight has loaded, and always for local
 * families, text stands in the fixed system stack of the family's category.
 * Nothing blocks the page.
 */

type FaceStatus = "loading" | "loaded" | "failed";

const faces = new Map<string, FaceStatus>();
const listeners = new Set<() => void>();
let version = 0;

/** The name text is set in: the family for Fontsource faces we add ourselves, the slug for Adobe. */
const cssFamily = (font: RoleFont) => (font.source === "adobe" ? adobeCssName(font) : font.family);

/** One weight of a loadable family; undefined for local families and Adobe ones without a name yet. */
function faceKey(font: RoleFont, weight: number) {
  if (font.source === "fontsource" && font.fontsourceId) return `fontsource:${font.fontsourceId}:${weight}`;
  if (font.source === "adobe" && adobeCssName(font)) return `adobe:${adobeCssName(font)}:${weight}`;
  return undefined;
}

function setStatus(key: string, status: FaceStatus) {
  faces.set(key, status);
  version++;
  for (const listener of listeners) listener();
}

let kitStylesheet: Promise<boolean> | undefined;

/** Adds the Adobe preview kit's stylesheet to the page once; false without a kit or when it fails to load. */
function loadKitStylesheet() {
  kitStylesheet ??= getAdobePreviewKitId().then(
    (kitId) =>
      kitId !== null &&
      new Promise<boolean>((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = adobeKitStylesheetUrl(kitId);
        link.onload = () => resolve(true);
        link.onerror = () => resolve(false);
        document.head.append(link);
      }),
    () => false,
  );
  return kitStylesheet;
}

/** Whether the weight loaded: Fontsource through a `FontFace` of our own, Adobe from the kit's `@font-face` rules. */
async function load(font: RoleFont, weight: number) {
  if (font.source === "fontsource" && font.fontsourceId) {
    const face = new FontFace(font.family, `url(${fontsourceFileUrl(font.fontsourceId, weight)}) format("woff2")`, {
      weight: String(weight),
    });
    document.fonts.add(face);
    await face.load();
    return true;
  }
  // `fonts.load` answers no faces for a family the kit does not declare (yet).
  return (await loadKitStylesheet()) && (await document.fonts.load(`${weight} 1em "${cssFamily(font)}"`)).length > 0;
}

function loadFace(font: RoleFont, weight: number) {
  const key = faceKey(font, weight);
  if (!key || faces.has(key)) return;
  faces.set(key, "loading");
  load(font, weight).then(
    (loaded) => setStatus(key, loaded ? "loaded" : "failed"),
    () => setStatus(key, "failed"),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const status = (font: RoleFont, weight: number) => {
  const key = faceKey(font, weight);
  return key ? faces.get(key) : undefined;
};

/** Whether the preview shows a stand-in: the family cannot be loaded, or one of its weights failed to. */
const isStandIn = (font: RoleFont) =>
  font.weights.some((weight) => !faceKey(font, weight) || status(font, weight) === "failed");

/**
 * Loads every weight of the given families (local ones and `undefined` are
 * skipped) and re-renders as they arrive. `fontStyle`
 * gives the inline style for text in a family and weight; `isStandIn` tells
 * when to show the "Ersatzschrift" badge.
 *
 * ```tsx
 * const { fontStyle } = useFontFaces([roles.heading, roles.body]);
 * <h1 style={fontStyle(roles.heading, 700)}>…</h1>
 * ```
 */
export function useFontFaces(fonts: (RoleFont | undefined)[]) {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

  // No dependency list: loading is idempotent, and the fonts are new arrays on every render.
  useEffect(() => {
    for (const font of fonts) {
      if (font) for (const weight of font.weights) loadFace(font, weight);
    }
  });

  return {
    fontStyle: (font: RoleFont, weight = font.weights[0] ?? 400) => ({
      fontFamily:
        status(font, weight) === "loaded"
          ? `"${cssFamily(font)}", ${fallbackStacks[font.category]}`
          : fallbackStacks[font.category],
      fontWeight: weight,
    }),
    isStandIn,
  };
}

/** "Ersatzschrift" next to a family the preview cannot show as itself. */
export function StandInBadge({ font }: { font: RoleFont }) {
  if (!isStandIn(font)) return null;
  return (
    <span
      title={`${font.family || "Diese Schrift"} ist nicht ladbar. Die Vorschau zeigt eine Systemschrift der Kategorie ${fontCategoryLabels[font.category]}.`}
      className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-900"
    >
      Ersatzschrift
    </span>
  );
}
