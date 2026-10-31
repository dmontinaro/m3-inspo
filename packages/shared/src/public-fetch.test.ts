/**
 * The web app's guarded page loader against a local HTTP server. The guard
 * is a stand-in that pins the made-up host `shop.example` to 127.0.0.1 and
 * refuses everything else, so a successful load proves the connection went
 * to the guard's address and not through DNS.
 */

import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicFetchError, fetchPublicText } from "./public-fetch";
import { BlockedUrlError } from "./public-url";

let server: Server;
let origin: string;
const checked: string[] = [];

/** Lets only `shop.example` through, pinned to the local test server. */
async function checkUrl(url: string) {
  checked.push(url);
  const parsed = new URL(url);
  if (parsed.hostname !== "shop.example") throw new BlockedUrlError("private-address");
  return { url: parsed, addresses: ["127.0.0.1"] };
}

beforeAll(async () => {
  server = createServer((request, response) => {
    switch (request.url) {
      case "/":
        response.end(`<title>Shop</title> host=${request.headers.host}`);
        break;
      case "/moved":
        response.writeHead(302, { location: "/" }).end();
        break;
      case "/inward":
        response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        break;
      case "/huge":
        response.writeHead(200, { "content-encoding": "gzip" }).end(gzipSync(Buffer.alloc(5_000_000, "a")));
        break;
      case "/silent":
        break; // never answers
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://shop.example:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("fetchPublicText", () => {
  it("connects to the address the guard returned, never resolving the name itself", async () => {
    const page = await fetchPublicText(`${origin}/`, 10_000, { checkUrl });

    expect(page).toMatchObject({ status: 200, truncated: false, url: `${origin}/` });
    expect(page.body).toBe(`<title>Shop</title> host=${new URL(origin).host}`);
  });

  it("checks every redirect target again and refuses one pointing inward", async () => {
    expect((await fetchPublicText(`${origin}/moved`, 10_000, { checkUrl })).url).toBe(`${origin}/`);

    checked.length = 0;
    await expect(fetchPublicText(`${origin}/inward`, 10_000, { checkUrl })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(checked).toEqual([`${origin}/inward`, "http://169.254.169.254/latest/meta-data/"]);
  });

  it("cuts the decoded body at the size cap", async () => {
    const page = await fetchPublicText(`${origin}/huge`, 1000, { checkUrl });

    expect(page.body).toHaveLength(1000);
    expect(page.truncated).toBe(true);
  });

  it("gives up at the deadline", async () => {
    await expect(fetchPublicText(`${origin}/silent`, 1000, { checkUrl, timeoutMs: 200 })).rejects.toEqual(
      new PublicFetchError("The page did not answer in time."),
    );
  });

  it("runs the real URL guard by default", async () => {
    await expect(fetchPublicText("http://127.0.0.1/", 1000)).rejects.toMatchObject({ reason: "private-address" });
  });
});
