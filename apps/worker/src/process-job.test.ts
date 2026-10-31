/**
 * Job processing in the capture worker: a real Chromium loads local test
 * pages, and a fake worker API records what the worker uploads and reports.
 *
 * The URL guard is the real one, adapted to local servers (`testGuard`): the
 * test site on 127.0.0.1 passes as a public stand-in, and random ports count
 * as the default port. An internal service on 127.0.0.2 stands for what must
 * never be reached; only the private-address rule stands in its way, and it
 * counts every TCP connection it gets, tunnels included.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicUrl } from "@m3-inspo/shared/public-url";
import type { ClaimedJob, Completion, WorkerApi } from "./api.ts";
import { processJob } from "./process-job.ts";

const testPage = `<!doctype html>
<html>
  <head>
    <title>Atelier Fjord – Test</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --brand: #c7402f; --paper: #faf7f2; }
      body { margin: 0; background: #faf7f2; color: #1d2433; font-family: "Test Sans", sans-serif; font-size: 18px; }
      main { max-width: 1120px; margin: 0 auto; padding: 48px 24px; }
      h1 { font-family: "Test Serif", serif; font-size: 64px; color: #c7402f; margin: 0 0 24px; }
      /* Taller than the 16,000 px cap; stripes, so no band of the full page looks blank. */
      .card { background-color: #2f6fdf; background-image: repeating-linear-gradient(#2f6fdf 0 300px, #1d2433 300px 320px);
              border-radius: 12px; padding: 32px; height: 20000px; color: #ffffff; }
      button { font-family: "Test Sans", sans-serif; border: 0; border-radius: 12px; padding: 12px 20px; background: #c7402f; color: #ffffff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Atelier Fjord</h1>
      <p>Ruhige Zimmer am Wasser, ein Frühstück mit Blick auf den Fjord und viel Platz für lange Tage.</p>
      <section class="card">Unsere Zimmer</section>
      <button>Zimmer buchen</button>
    </main>
  </body>
</html>`;

let sitePort = 0;
let internalPort = 0;
let internalConnections = 0;

/** The test site on 127.0.0.1. Every page reads the ports at request time. */
const site = createServer((request, response) => {
  const internal = `127.0.0.2:${internalPort}`;
  switch (request.url) {
    case "/":
      return response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(testPage);
    case "/redirect-to-metadata":
      return response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    case "/redirect-to-internal":
      return response.writeHead(302, { location: `http://${internal}/admin` }).end();
    case "/leaky":
      // Plain HTTP and tunnelled (https, ws) requests to the internal service, and one allowed WebSocket to the site.
      return response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
        <title>Leaky</title>
        <link rel="stylesheet" href="http://${internal}/style.css" />
        <h1>Leaky page</h1>
        <img src="http://${internal}/pixel.png" alt="" />
        <img src="https://${internal}/pixel.png" alt="" />
        <iframe src="http://${internal}/frame"></iframe>
        <script>
          fetch("http://${internal}/beacon").catch(() => {});
          new WebSocket("ws://${internal}/socket");
          const socket = new WebSocket("ws://127.0.0.1:${sitePort}/echo");
          socket.onmessage = (event) => { document.title = "Leaky " + event.data; };
        </script>`);
    case "/rebind":
      // The same name twice, once with a trailing dot, on the internal service's port.
      return response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
        <title>Rebind</title>
        <img src="http://rebind.test:${internalPort}/one.png" alt="" />
        <img src="http://rebind.test.:${internalPort}/two.png" alt="" />
        <img src="http://REBIND.test:${internalPort}/three.png" alt="" />`);
    case "/three-d":
      // Draws into a canvas in the document, as Three.js and its kin do.
      return response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
        <title>3D</title>
        <canvas id="scene" width="1440" height="900"></canvas>
        <script>document.getElementById("scene").getContext("webgl2");</script>`);
    case "/webgl-gate":
      // Tests a detached canvas itself and only loads its 3D app if WebGL works.
      return response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
        <title>Gate</title>
        <p id="unsupported" hidden>WebGL not supported</p>
        <script>
          if (!document.createElement("canvas").getContext("webgl")) document.getElementById("unsupported").hidden = false;
        </script>`);
    case "/webgl-probe":
      // A plain page with a third-party script that only asks a detached canvas, like a fingerprinting script.
      return response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
        <title>Probe</title>
        <h1>Plain page</h1>
        <script src="http://tracker.test:${sitePort}/fingerprint.js"></script>`);
    case "/fingerprint.js":
      return response.writeHead(200, { "content-type": "text/javascript" }).end(`document.createElement("canvas").getContext("webgl");`);
    case "/slow":
      // Never answers, like a page that hangs.
      return;
    default:
      return response.writeHead(404).end();
  }
});

// A minimal WebSocket endpoint: completes the handshake and sends one text frame.
site.on("upgrade", (request, socket) => {
  const accept = createHash("sha1")
    .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  // FIN + text frame, unmasked, 10 bytes of payload.
  socket.write(Buffer.concat([Buffer.from([0x81, 10]), Buffer.from("via-tunnel")]));
});

/** An internal service: must never get a connection. */
const internal = createServer((_request, response) => response.writeHead(200).end("secret"));
internal.on("connection", () => internalConnections++);

const listen = (server: Server, host: string) =>
  new Promise<number>((resolve) => server.listen(0, host, () => resolve((server.address() as AddressInfo).port)));

let siteUrl = "";

beforeAll(async () => {
  sitePort = await listen(site, "127.0.0.1");
  siteUrl = `http://127.0.0.1:${sitePort}`;
  internalPort = await listen(internal, "127.0.0.2");
});

afterAll(() => {
  site.closeAllConnections();
  site.close();
  internal.closeAllConnections();
  internal.close();
});

/** A public address the real guard accepts; the test guard hands it on as 127.0.0.1, where the test site runs. */
const siteStandIn = "93.184.215.14";

/**
 * The real guard for local servers: random ports count as the default port
 * (the port rule has its own tests), and 127.0.0.1 is the test site's public
 * stand-in. `dns` answers further names, e.g. with a different answer each time.
 */
function testGuard(dns: Record<string, () => string[] | Promise<string[]>> = {}) {
  return async (url: string) => {
    const parsed = new URL(url);
    parsed.port = "";
    if (parsed.hostname === "127.0.0.1") parsed.hostname = "site.test";
    const checked = await assertPublicUrl(parsed.href, async (hostname) =>
      hostname === "site.test" ? [siteStandIn] : (dns[hostname]?.() ?? []),
    );
    return { ...checked, addresses: checked.addresses.map((address) => (address === siteStandIn ? "127.0.0.1" : address)) };
  };
}

/** A worker API that records every call and accepts everything. */
function fakeApi() {
  const calls = {
    stages: [] as string[],
    uploads: new Map<string, Uint8Array>(),
    completions: [] as Completion[],
    failures: [] as string[],
  };
  let nextUpload = 0;
  const api: WorkerApi = {
    claim: async () => null,
    heartbeat: async (_job, stage) => {
      if (stage) calls.stages.push(stage);
    },
    uploadTargets: async (_job, count) =>
      Array.from({ length: count }, () => {
        const id = `00000000-0000-4000-8000-${String(++nextUpload).padStart(12, "0")}`;
        return { id, url: `/api/worker/objects/${id}` };
      }),
    upload: async (url, bytes) => {
      calls.uploads.set(url.split("/").at(-1) ?? "", bytes);
    },
    complete: async (_job, completion) => {
      calls.completions.push(completion);
    },
    fail: async (_job, error) => {
      calls.failures.push(error);
    },
  };
  return { api, calls };
}

const jobFor = (url: string): ClaimedJob => ({
  id: "6f1c1f58-2c5e-4a55-9a1e-3f1f4c7f7a10",
  kind: "url_capture",
  attempt: 1,
  input: { url },
});

const privateAddress = "Blocked URL: the host points to a private or reserved address.";

describe("processJob", () => {
  it("captures desktop and mobile, uploads the images and reports them with the design values of the page", async () => {
    const { api, calls } = fakeApi();

    const outcome = await processJob(jobFor(`${siteUrl}/`), api, { checkUrl: testGuard() });

    expect(calls.failures).toEqual([]);
    expect(outcome).toBe("ready");
    expect(calls.completions).toHaveLength(1);
    const [completion] = calls.completions;
    expect(completion?.pageTitle).toBe("Atelier Fjord – Test");
    expect(completion?.captures.map(({ viewport, kind }) => `${viewport}/${kind}`)).toEqual([
      "desktop/hero",
      "desktop/full",
      "mobile/hero",
    ]);

    const images = await Promise.all(
      (completion?.captures ?? []).map(async ({ uploadId }) => sharp(calls.uploads.get(uploadId)).metadata()),
    );
    // The page is over 20,000 px tall; the full page ends at 16,000.
    expect(images.map(({ format, width, height }) => ({ format, width, height }))).toEqual([
      { format: "png", width: 1440, height: 900 },
      { format: "png", width: 1440, height: 16_000 },
      { format: "png", width: 750, height: 1624 },
    ]);

    expect(completion?.mode).toBe("light");
    expect(completion?.tokens?.palette.slice(0, 1)).toEqual(["#faf7f2"]);
    expect(completion?.tokens?.palette).toEqual(expect.arrayContaining(["#c7402f", "#1d2433", "#2f6fdf"]));
    expect(completion?.tokens?.fonts).toEqual(expect.arrayContaining(["Test Serif", "Test Sans"]));
    expect(completion?.tokens?.typeRamp).toContainEqual(expect.objectContaining({ role: "h1", family: "Test Serif", sizePx: 64 }));
    expect(completion?.tokens?.cssVariables).toMatchObject({ "--brand": "#c7402f", "--paper": "#faf7f2" });
    expect(completion?.tokens?.containerWidth).toBe(1120);
    expect(completion?.tokens?.radiusScale).toContain(12);
    expect(completion?.tokens?.spacingScale).toContain(48);
    expect(calls.stages).toEqual(expect.arrayContaining(["capturing", "uploading"]));
  }, 90_000);

  it("captures a font's page as its preview: only the desktop hero, nothing read from the page", async () => {
    const { api, calls } = fakeApi();
    const job: ClaimedJob = { id: "1a2b3c4d-0000-4000-8000-000000000091", kind: "font_preview", attempt: 1, input: { pageUrl: `${siteUrl}/` } };

    expect(await processJob(job, api, { checkUrl: testGuard() })).toBe("ready");

    const [completion] = calls.completions;
    expect(completion).toEqual({ captures: [{ uploadId: expect.any(String), viewport: "desktop", kind: "hero" }] });
    const image = await sharp(calls.uploads.get(completion!.captures[0]!.uploadId)).metadata();
    expect({ width: image.width, height: image.height }).toEqual({ width: 1440, height: 900 });
  }, 90_000);

  it("notes WebGL for a page that draws 3D or gates on WebGL itself, not for one where a third party only probes for it", async () => {
    const threeD = fakeApi();
    const gate = fakeApi();
    const probe = fakeApi();
    const checkUrl = testGuard({ "tracker.test": () => [siteStandIn] });

    await processJob(jobFor(`${siteUrl}/three-d`), threeD.api, { checkUrl });
    await processJob(jobFor(`${siteUrl}/webgl-gate`), gate.api, { checkUrl });
    await processJob(jobFor(`${siteUrl}/webgl-probe`), probe.api, { checkUrl });

    expect(threeD.calls.completions[0]?.tech).toContain("WebGL");
    expect(gate.calls.completions[0]?.tech).toContain("WebGL");
    expect(probe.calls.completions[0]?.tech).not.toContain("WebGL");
  }, 90_000);

  it("refuses a blocked start URL without loading it", async () => {
    const { api, calls } = fakeApi();

    const outcome = await processJob(jobFor("http://169.254.169.254/latest/meta-data/"), api);

    expect(outcome).toBe("failed");
    expect(calls.failures).toEqual([privateAddress]);
    expect(calls.uploads.size).toBe(0);
  });

  it("fails with a clear message when the page redirects to a private address", async () => {
    const toMetadata = fakeApi();
    const toInternal = fakeApi();
    const connectionsBefore = internalConnections;

    const outcomes = [
      await processJob(jobFor(`${siteUrl}/redirect-to-metadata`), toMetadata.api, { checkUrl: testGuard() }),
      await processJob(jobFor(`${siteUrl}/redirect-to-internal`), toInternal.api, { checkUrl: testGuard() }),
    ];

    expect(outcomes).toEqual(["failed", "failed"]);
    expect(toMetadata.calls.failures).toEqual([privateAddress]);
    expect(toInternal.calls.failures).toEqual([privateAddress]);
    expect(internalConnections).toBe(connectionsBefore);
    for (const { calls } of [toMetadata, toInternal]) {
      expect(calls.completions).toEqual([]);
      expect(calls.uploads.size).toBe(0);
    }
  }, 60_000);

  it("fails when the page takes longer than the time budget", async () => {
    const { api, calls } = fakeApi();

    const outcome = await processJob(jobFor(`${siteUrl}/slow`), api, { checkUrl: testGuard(), pageBudgetMs: 2000 });

    expect(outcome).toBe("failed");
    expect(calls.failures).toEqual(["The page did not finish within 2 seconds."]);
    expect(calls.completions).toEqual([]);
  }, 60_000);

  it("abandons a job without reporting it when the worker shuts down, so its lease runs out and it is handed out again", async () => {
    const { api, calls } = fakeApi();
    const shutdown = new AbortController();
    setTimeout(() => shutdown.abort(), 1000);

    const outcome = await processJob(jobFor(`${siteUrl}/slow`), api, { checkUrl: testGuard(), signal: shutdown.signal });

    expect(outcome).toBe("abandoned");
    expect(calls.failures).toEqual([]);
    expect(calls.completions).toEqual([]);
  }, 60_000);

  it("counts the start URL's DNS lookup into the time budget", async () => {
    const { api, calls } = fakeApi();
    const hanging = testGuard({ "hang.test": () => new Promise<string[]>(() => {}) });

    const outcome = await processJob(jobFor("http://hang.test/"), api, { checkUrl: hanging, pageBudgetMs: 2000 });

    expect(outcome).toBe("failed");
    expect(calls.failures).toEqual(["The page did not finish within 2 seconds."]);
  }, 30_000);

  it("blocks sub-resources, frames and tunnels to private addresses and lets allowed tunnels through", async () => {
    const { api, calls } = fakeApi();
    const connectionsBefore = internalConnections;

    const outcome = await processJob(jobFor(`${siteUrl}/leaky`), api, { checkUrl: testGuard() });

    expect(outcome).toBe("ready");
    expect(internalConnections).toBe(connectionsBefore);
    // The title changes only if the WebSocket to the site made it through its tunnel.
    expect(calls.completions[0]?.pageTitle).toBe("Leaky via-tunnel");
  }, 60_000);

  it("connects only to the address it checked, even when DNS answers differently the next time", async () => {
    const { api } = fakeApi();
    let lookups = 0;
    // Public on the first lookup, the internal service on every later one.
    const rebinding = testGuard({ "rebind.test": () => (lookups++ === 0 ? [siteStandIn] : ["127.0.0.2"]) });
    const connectionsBefore = internalConnections;

    const outcome = await processJob(jobFor(`${siteUrl}/rebind`), api, { checkUrl: rebinding });

    expect(outcome).toBe("ready");
    expect(lookups).toBeGreaterThanOrEqual(2);
    expect(internalConnections).toBe(connectionsBefore);
  }, 60_000);
});
