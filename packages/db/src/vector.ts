/**
 * Embeddings: text into one vector space (1024 dimensions, German and
 * English together), plus the arithmetic that ranks with them. By default
 * Voyage's `voyage-4` through OpenRouter; any OpenAI-compatible
 * `/embeddings` endpoint works (EMBEDDINGS_BASE_URL, EMBEDDINGS_MODEL).
 *
 *  - `embedText(input)` embeds one prepared text. The web app's embedding
 *    job sends a reference's text (title, notes, tags, description) through
 *    `documentInput` and stores the result in `reference_embeddings`.
 *  - `embedQuery(text)` embeds a search query or briefing through
 *    `queryInput`, with a small LRU so repeated queries are free. Returns
 *    null without EMBEDDINGS_API_KEY or when the call fails; callers fall
 *    back to text search then.
 *  - `cosineSim` and `fuseRankings` (reciprocal rank fusion) rank with them.
 *
 * Retrieval models want queries and documents marked differently (Voyage's
 * `input_type`, e5's "query: " / "passage: "). OpenRouter only passes plain
 * text, so `queryInput` and `documentInput` write that mark into the text
 * the way each model family documents it. Reference-to-reference similarity
 * compares two documents.
 *
 * Talks to the endpoint with plain `fetch`, which is also where tests
 * replace it. Never logs the texts it embeds.
 * Started from Nutlope/inspo's vector.ts (LICENSE-INSPO).
 */

export const EMBEDDING_DIMS = 1024;

/** The embedding model, `EMBEDDINGS_MODEL` or Voyage 4. Stored with each vector: vectors of different models are never compared. */
export const embeddingModel = () => process.env.EMBEDDINGS_MODEL || "voyageai/voyage-4";

/** Whether embeddings are on: only with EMBEDDINGS_API_KEY set. Without it search is text only. */
export const embeddingsEnabled = () => Boolean(process.env.EMBEDDINGS_API_KEY);

/**
 * The lowest cosine between a query and a reference that still counts as a
 * semantic match; below it the vector side of a search ignores a reference.
 * Measured with voyage-4 on the owner's 15 references (2026-09-24): fitting
 * references scored 0.41-0.66 for short German queries, unrelated ones
 * 0.15-0.35. Re-measure after a model change.
 */
export const minQuerySimilarity = 0.4;

/**
 * The lowest cosine between two references that still counts as "similar".
 * Two documents score higher with each other than a short query does. With
 * voyage-4 on the owner's library (2026-09-24) pairs ran from 0.28 to 0.86,
 * median 0.61; from 0.70 on (the top quarter) they were alike in kind, e.g.
 * two SaaS dashboards. Re-measure after a model change.
 */
export const minNeighbourSimilarity = 0.7;

const e5Instruction =
  "Given a design briefing or search query, retrieve saved website and app designs whose title, notes, tags and description match it";

/** How a model family wants queries and documents, from its model card; any other model gets the text as it is. */
const inputFormats: { family: RegExp; query: (text: string) => string; document: (text: string) => string }[] = [
  {
    family: /^voyageai\//,
    query: (text) => `Represent the query for retrieving supporting documents: ${text}`,
    document: (text) => `Represent the document for retrieval: ${text}`,
  },
  { family: /e5-.*instruct/, query: (text) => `Instruct: ${e5Instruction}\nQuery: ${text}`, document: (text) => text },
  { family: /e5-/, query: (text) => `query: ${text}`, document: (text) => `passage: ${text}` },
];

const inputFormat = () => inputFormats.find((format) => format.family.test(embeddingModel()));

/** A search query as the current model expects it. */
export const queryInput = (query: string) => inputFormat()?.query(query) ?? query;

/** A reference's text as the current model expects it. */
export const documentInput = (text: string) => inputFormat()?.document(text) ?? text;

/** The endpoint could not embed: no key, an error status, a timeout or an answer without a usable vector. */
export class EmbeddingError extends Error {
  override name = "EmbeddingError";
  constructor(
    message: string,
    /** The endpoint's HTTP status, when it answered. */
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * One prepared text (`queryInput` or `documentInput`) as a vector. Throws
 * `EmbeddingError` (or the timeout's error).
 */
export async function embedText(input: string): Promise<Float32Array> {
  const apiKey = process.env.EMBEDDINGS_API_KEY;
  if (!apiKey) throw new EmbeddingError("EMBEDDINGS_API_KEY is not set.");
  const baseUrl = process.env.EMBEDDINGS_BASE_URL || "https://openrouter.ai/api/v1";
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: embeddingModel(), input, dimensions: EMBEDDING_DIMS }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new EmbeddingError(`The embeddings endpoint answered ${response.status}.`, response.status);
  const body = (await response.json()) as { data?: { embedding?: unknown }[] };
  const vector = body.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMS || !vector.every((value) => typeof value === "number")) {
    throw new EmbeddingError(`The embeddings endpoint answered without a ${EMBEDDING_DIMS}-dimensional vector.`);
  }
  return Float32Array.from(vector);
}

/* ────────────────────── embed query (cached) ────────────────────── */

const queryCacheMax = 64;
const queryCache = new Map<string, Float32Array>();

/**
 * A search query or briefing as a vector, or null without a key, for an
 * empty query or when the endpoint fails. The last 64 queries are cached (per
 * model).
 */
export async function embedQuery(text: string): Promise<Float32Array | null> {
  const query = text.trim();
  if (!query || !embeddingsEnabled()) return null;
  const key = `${embeddingModel()}\n${query}`;
  const cached = queryCache.get(key);
  if (cached) {
    // LRU touch
    queryCache.delete(key);
    queryCache.set(key, cached);
    return cached;
  }
  try {
    const vector = await embedText(queryInput(query));
    if (queryCache.size >= queryCacheMax) queryCache.delete(queryCache.keys().next().value ?? "");
    queryCache.set(key, vector);
    return vector;
  } catch (error) {
    console.warn(`[embeddings] query not embedded: ${error instanceof Error ? error.name : typeof error}`);
    return null;
  }
}

/* ────────────────────── ranking ────────────────────── */

/** Cosine between two same-length vectors. Returns 0 for degenerate
 *  inputs. Inputs are not assumed to be normalised. */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Reciprocal rank fusion's damping constant: rank r in a list is worth `1 / (RRF_K + r)`. */
export const RRF_K = 60;

/**
 * Reciprocal rank fusion: each ranked list (best first) adds
 * `1 / (RRF_K + rank)` to every id it holds, rank counted from 1. An id high in
 * both the text and the vector ranking beats one that tops only one of
 * them, and neither list's raw scores need to be comparable. Returns the
 * ids of all lists, best first.
 */
export function fuseRankings(...lists: string[][]): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + index + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
