/**
 * Replaces the embeddings endpoint (OpenRouter) at the network boundary (global
 * `fetch`) with fixed vectors, so the real embedding code runs in tests
 * without calling openrouter.ai. Each concept is one dimension; a text
 * points along every concept one of whose words (German or English) it
 * contains, the way the multilingual model puts "Seeufer" next to
 * "lakeside". A text without any concept points along a last dimension of
 * its own. Every vector also shares a small common component, as real
 * models' do: unrelated texts land near 0.2 and texts sharing a concept at
 * 0.75 or more, like Voyage 4 on the owner's library (see
 * `minQuerySimilarity` and `minNeighbourSimilarity`).
 *
 * ```ts
 * const provider = useFakeEmbeddings([["lakeside", "seeufer"], ["fintech", "finanz"]]);
 * provider.inputs; // every text sent, in order
 * provider.failing = true; // answers 500 from now on
 * ```
 */

import { vi } from "vitest";

/** The dimension every vector shares, and its weight: no two real vectors are unrelated down to 0. */
const commonDimension = 1022;
const commonWeight = 0.6;

export function useFakeEmbeddings(concepts: string[][]) {
  const realFetch = globalThis.fetch;
  const fake = { inputs: [] as string[], failing: false };

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname !== "openrouter.ai") return realFetch(input, init);
    if (url.pathname !== "/api/v1/embeddings") throw new Error(`Unexpected OpenRouter request in test: ${url.href}`);
    if (fake.failing) return Response.json({ error: { type: "server_error", message: "down" } }, { status: 500 });

    const { input: text } = JSON.parse(String(init?.body)) as { input: string };
    fake.inputs.push(text);
    const lower = text.toLowerCase();
    const vector = Array.from({ length: 1024 }, () => 0);
    concepts.forEach((words, index) => {
      if (words.some((word) => lower.includes(word))) vector[index] = 1;
    });
    if (!vector.includes(1)) vector[1023] = 1;
    vector[commonDimension] = commonWeight;
    return Response.json({ object: "list", data: [{ object: "embedding", index: 0, embedding: vector }] });
  });
  return fake;
}
