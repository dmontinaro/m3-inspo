/**
 * Replaces Fontsource's metadata API at the network boundary (global
 * `fetch`), so the real font catalog sync runs in tests without calling
 * api.fontsource.org. `families` is what the next sync receives, in
 * Fontsource's own shape (see `fontsourceFamily`).
 *
 * ```ts
 * const fontsource = useFakeFontsource([fontsourceFamily({ id: "inter", family: "Inter" })]);
 * fontsource.families = [];     // the next sync gets an empty list
 * fontsource.failing = true;    // answers 503 from now on
 * ```
 */

import { vi } from "vitest";

export type FontsourceFamily = {
  id: string;
  family: string;
  subsets: string[];
  weights: number[];
  styles: string[];
  defSubset: string;
  variable: boolean;
  lastModified: string;
  category: string;
  license: string;
  type: string;
};

/** A family as Fontsource lists it: a static Google sans with 400 and 700 unless `overrides` say otherwise. */
export const fontsourceFamily = (overrides: Partial<FontsourceFamily> & Pick<FontsourceFamily, "id" | "family">) => ({
  subsets: ["latin"],
  weights: [400, 700],
  styles: ["normal"],
  defSubset: "latin",
  variable: false,
  lastModified: "2026-01-01",
  category: "sans-serif",
  license: "OFL-1.1",
  type: "google",
  ...overrides,
});

export function useFakeFontsource(families: unknown[]) {
  const realFetch = globalThis.fetch;
  const fake = { families, failing: false, requests: 0 };

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname !== "api.fontsource.org") return realFetch(input, init);
    if (url.pathname !== "/v1/fonts") throw new Error(`Unexpected Fontsource request in test: ${url.href}`);
    fake.requests++;
    if (fake.failing) return Response.json({ message: "down" }, { status: 503 });
    return Response.json(fake.families);
  });

  return fake;
}
