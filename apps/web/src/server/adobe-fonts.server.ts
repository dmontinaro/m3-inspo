/**
 * Adobe Fonts for the type pairing previews (#88). Through the Adobe Fonts
 * API (formerly Typekit) the app keeps one preview kit per environment and
 * adds every Adobe family of a pairing to it, so the previews load the real
 * typeface from use.typekit.net. Off without ADOBE_FONTS_API_TOKEN: then
 * families are not looked up and the previews show the fallback stack.
 *
 * The kit is found by its name, "Inspo Vorschau (<host of INSPO_BASE_URL>)",
 * so the app stores nothing about it. It is created with unsegmented CSS
 * names, so a family's CSS name is its slug. Adobe publishes kits
 * asynchronously: changes reach the CDN within about five minutes.
 */

import { z } from "zod";
import { slugify } from "./slug";

const apiUrl = "https://typekit.com/api/v1/json";

export const adobeFontsEnabled = () => Boolean(process.env.ADOBE_FONTS_API_TOKEN);

/** An answer of the Adobe Fonts API other than 2xx. */
class AdobeFontsError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Adobe Fonts answered ${status} for ${path}`);
  }
}

/** GET, or POST with `form`; the parsed JSON body, throws AdobeFontsError on any answer but 2xx. */
async function api(path: string, form?: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${apiUrl}/${path}`, {
    method: form ? "POST" : "GET",
    headers: { "X-Typekit-Token": process.env.ADOBE_FONTS_API_TOKEN ?? "" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new AdobeFontsError(response.status, path);
  return response.json();
}

const familyAnswer = z.object({ family: z.object({ id: z.string(), name: z.string(), slug: z.string() }) });
const kitList = z.object({ kits: z.array(z.object({ id: z.string() })) });
const kitAnswer = z.object({ kit: z.object({ id: z.string(), name: z.string(), families: z.array(z.object({ id: z.string() })) }) });

/**
 * The family Adobe Fonts has under `name` ("neue haas unica" finds "Neue
 * Haas Unica"), looked up by its slug since the API has no search; null when
 * Adobe does not know it. Throws when the API fails.
 */
export async function findAdobeFamily(name: string) {
  const slug = slugify(name);
  if (!slug) return null;
  try {
    return familyAnswer.parse(await api(`families/${slug}`)).family;
  } catch (error) {
    if (error instanceof AdobeFontsError && error.status === 404) return null;
    throw error;
  }
}

const host = () => new URL(process.env.INSPO_BASE_URL || "http://localhost:3000").hostname;

export const previewKitName = () => `Inspo Vorschau (${host()})`;

let kitId: Promise<string> | undefined;

/** The preview kit's id, found by name or created; cached per process, a failure is retried on the next call. */
export function previewKitId() {
  kitId ??= findOrCreateKit().catch((error: unknown) => {
    kitId = undefined;
    throw error;
  });
  return kitId;
}

async function findOrCreateKit() {
  for (const { id } of kitList.parse(await api("kits")).kits) {
    const { kit } = kitAnswer.parse(await api(`kits/${id}`));
    if (kit.name === previewKitName()) return kit.id;
  }
  const form = new URLSearchParams({ name: previewKitName(), segmented_css_names: "false" });
  for (const domain of new Set([host(), "localhost"])) form.append("domains[]", domain);
  return kitAnswer.parse(await api("kits", form)).kit.id;
}

/**
 * Adds the families (Adobe ids) the preview kit lacks, with all characters
 * so umlauts and € are there, and publishes the kit if it changed. Returns
 * the ids it added.
 */
export async function addToPreviewKit(familyIds: string[]) {
  const id = await previewKitId();
  try {
    const present = new Set(kitAnswer.parse(await api(`kits/${id}`)).kit.families.map((family) => family.id));
    const missing = [...new Set(familyIds)].filter((family) => !present.has(family));
    for (const family of missing) await api(`kits/${id}/families/${family}`, new URLSearchParams({ subset: "all" }));
    if (missing.length > 0) await api(`kits/${id}/publish`, new URLSearchParams());
    return missing;
  } catch (error) {
    // The kit may have been deleted at Adobe; look it up again next time.
    kitId = undefined;
    throw error;
  }
}
