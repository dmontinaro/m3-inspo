/**
 * Load result thumbnails so the MCP can return them as native `image`
 * content blocks alongside the JSON text. This is the big ergonomic
 * win for agents: instead of curling each result URL and Reading it
 * (4 extra tool calls per query), the agent sees the thumbnails
 * directly in the tool response.
 *
 * Bytes come from the `ReadAsset` function the server was created with,
 * keyed by the image reference exactly as it appears on the catalogue
 * row (`thumbUrl`, a variant URL, ...). That keeps private storage
 * possible: the reader can resolve a reference against a bucket instead
 * of a public URL. `fetchAsset` is the plain-HTTP reader.
 *
 * Source: prefer a small WebP variant if it exists, otherwise fall back
 * to the PNG thumb. Never AVIF: the model APIs we care about decode
 * PNG/JPEG/WebP only (Anthropic, Moonshot K2.7/MoonViT, Qwen-VL), so an
 * inlined AVIF block is a wasted ~7 KB the model errors on or silently
 * drops.
 *
 * Performance budget:
 *   - Parallel reads across all results in one tool call
 *   - 800 KB hard cap per image — drop oversized
 *   - fetchAsset: 3 s per-image timeout — drop on slow fetches
 *
 * Failure mode is non-fatal: if a read fails, we return `null` and the
 * caller drops that image from the response. JSON text always still
 * goes back.
 */

import { absolute } from "./url";

const FETCH_TIMEOUT_MS = 3000;
const MAX_IMAGE_BYTES = 800 * 1024;

/** Raw bytes of one stored image. */
export type Asset = { data: Uint8Array; mimeType: string };

/** Reads one image by its catalogue reference; null when it is missing
 *  or unreadable. Must not throw for a missing image. */
export type ReadAsset = (ref: string) => Promise<Asset | null>;

export type InlineImage = {
  type: "image";
  data: string; // base64
  mimeType: string;
};

function mimeFromUrl(url: string): string {
  const path = url.split("?")[0]!.toLowerCase();
  if (path.endsWith(".avif")) return "image/avif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

/** `ReadAsset` over HTTP(S): relative references resolve against
 *  INSPO_BASE_URL (see url.ts). */
export const fetchAsset: ReadAsset = async (ref) => {
  const url = absolute(ref);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_IMAGE_BYTES) return null;
    return {
      data: new Uint8Array(await res.arrayBuffer()),
      mimeType: res.headers.get("content-type") ?? mimeFromUrl(url),
    };
  } catch {
    return null;
  }
};

/** Build a small-WebP candidate from the PNG thumb reference by
 *  rewriting `.../thumb.png` to `.../thumb.384.webp`, the naming the
 *  worker's variant encoder uses. Returns null when the reference
 *  doesn't match the pattern (caller falls back to the PNG). */
function webpVariantFor(thumbUrl: string): string | null {
  // Match `/<slug>/thumb.png[?v=...]`. Replace `thumb.png` with
  // `thumb.384.webp` preserving the query string.
  const re = /\/thumb\.png(\?[^#]*)?$/;
  if (!re.test(thumbUrl)) return null;
  return thumbUrl.replace(re, "/thumb.384.webp$1");
}

async function readOne(
  readAsset: ReadAsset,
  ref: string,
): Promise<InlineImage | null> {
  const asset = await readAsset(ref).catch(() => null);
  if (!asset || asset.data.byteLength > MAX_IMAGE_BYTES) return null;
  // Never inline a format the model APIs can't decode — the caller
  // falls back to the next candidate.
  if (asset.mimeType.includes("avif")) return null;
  let bin = "";
  for (let i = 0; i < asset.data.byteLength; i++)
    bin += String.fromCharCode(asset.data[i]!);
  return { type: "image", data: btoa(bin), mimeType: asset.mimeType };
}

/**
 * Read a thumbnail block for a result. Accepts either one reference or
 * an ordered candidate list (smallest/most-efficient first); the first
 * candidate that resolves wins. A bare `.../thumb.png` reference still
 * gets its `.384.webp` sibling synthesized and tried first, so callers
 * that pass a single PNG keep the WebP-preferred behavior.
 */
export async function thumbnailBlock(
  readAsset: ReadAsset,
  candidates: string | ReadonlyArray<string>,
): Promise<InlineImage | null> {
  const list = typeof candidates === "string" ? [candidates] : [...candidates];
  const expanded: string[] = [];
  for (const ref of list) {
    const webpCandidate = ref.endsWith(".webp") ? null : webpVariantFor(ref);
    if (webpCandidate && !list.includes(webpCandidate))
      expanded.push(webpCandidate);
    expanded.push(ref);
  }
  for (const ref of expanded) {
    const block = await readOne(readAsset, ref);
    if (block) return block;
  }
  return null;
}

/**
 * Read many thumbnails in parallel. Returns one block per input entry,
 * with `null` slots for ones that failed. The caller is expected to
 * filter nulls out.
 */
export async function thumbnailBlocks(
  readAsset: ReadAsset,
  refs: ReadonlyArray<string | ReadonlyArray<string>>,
): Promise<Array<InlineImage | null>> {
  return Promise.all(refs.map((r) => thumbnailBlock(readAsset, r)));
}

/** Token-cost back-of-envelope so we don't accidentally over-pack a
 *  response. ~1.33 chars per base64 byte. Each image content block
 *  costs roughly its base64 length in tokens (chars / 3). At 50 KB
 *  PNG base64 → ~66 KB string → ~22 K tokens. Tools that return
 *  many results should keep the limit modest (e.g. limit=6) to stay
 *  inside a reasonable response envelope. */
export const MAX_INLINE_PER_CALL = 12;

/** Total decoded-byte budget for ALL inline images in one response.
 *  Blocks past the budget are dropped in order (the JSON URLs remain,
 *  so the agent can still fetch what was cut). Override with
 *  INSPO_MAX_INLINE_BYTES. */
export const MAX_INLINE_TOTAL_BYTES = (() => {
  const raw = Number(process.env.INSPO_MAX_INLINE_BYTES ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 800 * 1024;
})();
