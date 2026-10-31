/**
 * Loads a public page as text for the web app, only through the URL guard
 * (./public-url): the start URL and every redirect target are checked, and
 * each connection goes to an address the guard returned for it and to
 * nothing else, so a second DNS answer cannot point it inward (DNS
 * rebinding). A GET without cookies, with a size cap on the decoded body and
 * one deadline for the whole exchange, redirects included.
 *
 * ```ts
 * const page = await fetchPublicText("https://linear.app", 1_500_000);
 * page.body; // at most 1.5 MB of text, `truncated` says whether more was cut off
 * await fetchPublicText("http://169.254.169.254/", 1000); // throws BlockedUrlError
 * ```
 *
 * Node only (node:http, node:https), so it is a subpath export.
 */

import { request as httpRequest } from "node:http";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { pipeline } from "node:stream";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { assertPublicUrl } from "./public-url";
import type { CheckedUrl } from "./public-url";

export type PublicPage = {
  /** The URL the body came from, after redirects. */
  url: string;
  status: number;
  headers: Headers;
  body: string;
  /** True when the body was cut off at the size cap. */
  truncated: boolean;
};

export type FetchPublicOptions = {
  /** Deadline for the whole exchange, redirects included. Default 10 s. */
  timeoutMs?: number;
  /** Redirects followed at most, each checked again. Default 3. */
  maxRedirects?: number;
  /** The URL guard. Default `assertPublicUrl`; tests pass their own. */
  checkUrl?: (url: string) => Promise<CheckedUrl>;
};

/** Refusals that are no guard verdict: timeout, network error, redirect loop. The message names no address. */
export class PublicFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicFetchError";
  }
}

const userAgent = "Mozilla/5.0 (compatible; M3Inspo/1.0)";

/** Answers every name with the guard's addresses; the name itself is never resolved again. */
const pinnedLookup =
  (addresses: string[]): LookupFunction =>
  (_hostname, options, callback) => {
    const entries = addresses.map((address) => ({ address, family: isIP(address) }));
    if (options.all) callback(null, entries);
    else callback(null, entries[0]!.address, entries[0]!.family);
  };

/** The response body, decompressed as the server says it is encoded. An error on either side ends both. */
function decoded(response: IncomingMessage): Readable {
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  const decompress =
    encoding === "gzip" || encoding === "x-gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : encoding === "br"
          ? createBrotliDecompress()
          : null;
  return decompress ? pipeline(response, decompress, () => {}) : response;
}

/** Reads at most `maxBytes` of `stream`, then stops reading. */
async function readCapped(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const room = maxBytes - total;
    chunks.push(chunk.byteLength > room ? chunk.subarray(0, room) : chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) break;
  }
  return { body: Buffer.concat(chunks).toString("utf8"), truncated: total > maxBytes };
}

const toHeaders = (headers: IncomingHttpHeaders) =>
  new Headers(
    Object.entries(headers).flatMap(([name, value]): [string, string][] =>
      value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]],
    ),
  );

/** One GET to a checked URL, connected only to its checked addresses. */
function get({ url, addresses }: CheckedUrl, signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    send(
      url,
      {
        method: "GET",
        headers: { "user-agent": userAgent, accept: "text/html,text/css;q=0.9,*/*;q=0.5", "accept-encoding": "gzip, deflate, br" },
        lookup: pinnedLookup(addresses),
        signal,
      },
      resolve,
    )
      .on("error", reject)
      .end();
  });
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * GETs `url` and returns at most `maxBytes` of its decoded body. Throws
 * `BlockedUrlError` when the guard refuses the URL or a redirect target, and
 * `PublicFetchError` on timeout, network errors or too many redirects.
 */
export async function fetchPublicText(url: string, maxBytes: number, options: FetchPublicOptions = {}): Promise<PublicPage> {
  const { timeoutMs = 10_000, maxRedirects = 3, checkUrl = assertPublicUrl } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let next = url;
  for (let redirects = 0; ; redirects++) {
    const checked = await checkUrl(next);
    try {
      const response = await get(checked, signal);
      const location = response.headers.location;
      if (redirectStatuses.has(response.statusCode ?? 0) && location) {
        response.destroy();
        if (redirects >= maxRedirects) throw new PublicFetchError("The page redirects too often.");
        next = new URL(location, checked.url).href;
        continue;
      }
      const body = decoded(response);
      const { body: text, truncated } = await readCapped(body, maxBytes);
      response.destroy();
      return { url: checked.url.href, status: response.statusCode ?? 0, headers: toHeaders(response.headers), body: text, truncated };
    } catch (error) {
      if (error instanceof PublicFetchError) throw error;
      throw new PublicFetchError(signal.aborted ? "The page did not answer in time." : "The page could not be loaded.");
    }
  }
}
