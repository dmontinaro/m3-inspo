/**
 * Replaces the Adobe Fonts API (typekit.com/api/v1/json) at the network
 * boundary (global `fetch`), so the preview kit code runs in tests without
 * an Adobe account. `families` is Adobe's library, found by id or slug;
 * `kits` holds the kits the app created, with their families and how often
 * each was published.
 *
 * ```ts
 * const adobe = useFakeAdobeFonts([{ id: "abcd", name: "Neue Haas Unica", slug: "neue-haas-unica" }]);
 * adobe.kits[0]?.families;  // ["abcd"] once a pairing with the family was saved
 * ```
 */

import { vi } from "vitest";

export type AdobeFamily = { id: string; name: string; slug: string };
export type FakeKit = { id: string; name: string; domains: string[]; segmentedCssNames: string; families: string[]; published: number };

export const fakeAdobeToken = "fake-adobe-token";

export function useFakeAdobeFonts(families: AdobeFamily[]) {
  const realFetch = globalThis.fetch;
  const fake = { families, kits: [] as FakeKit[] };

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname !== "typekit.com") return realFetch(input, init);
    if (new Headers(init?.headers).get("X-Typekit-Token") !== fakeAdobeToken) return Response.json({}, { status: 401 });

    const path = url.pathname.replace("/api/v1/json/", "").split("/");
    const form = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined);
    const post = init?.method === "POST";
    const kit = fake.kits.find((candidate) => candidate.id === path[1]);
    const kitAnswer = (found: FakeKit) =>
      Response.json({ kit: { id: found.id, name: found.name, domains: found.domains, families: found.families.map((id) => ({ id })) } });

    if (path[0] === "families" && path.length === 2) {
      const family = fake.families.find((candidate) => candidate.id === path[1] || candidate.slug === path[1]);
      return family ? Response.json({ family }) : Response.json({ errors: ["Not Found"] }, { status: 404 });
    }
    if (path[0] === "kits" && path.length === 1 && !post) return Response.json({ kits: fake.kits.map(({ id }) => ({ id })) });
    if (path[0] === "kits" && path.length === 1 && post) {
      const created: FakeKit = {
        id: `kit${fake.kits.length + 1}`,
        name: form.get("name") ?? "",
        domains: form.getAll("domains[]"),
        segmentedCssNames: form.get("segmented_css_names") ?? "true",
        families: [],
        published: 0,
      };
      fake.kits.push(created);
      return kitAnswer(created);
    }
    if (kit && path.length === 2 && !post) return kitAnswer(kit);
    if (kit && path[2] === "families" && path[3] && post) {
      if (form.get("subset") !== "all") throw new Error("The preview kit should take all characters.");
      if (!kit.families.includes(path[3])) kit.families.push(path[3]);
      return kitAnswer(kit);
    }
    if (kit && path[2] === "publish" && post) {
      kit.published++;
      return Response.json({ published: new Date().toISOString() });
    }
    throw new Error(`Unexpected Adobe Fonts request in test: ${init?.method ?? "GET"} ${url.href}`);
  });

  return fake;
}
