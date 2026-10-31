/**
 * A local HTTP proxy that Chromium sends all of its traffic through, so the
 * URL guard sees every request: documents, each redirect hop, frames,
 * sub-resources, WebSockets and service workers. Playwright's request
 * routing cannot do this alone, since it does not see redirect hops.
 *
 * Refused requests get a 403 (plain HTTP) or a refused tunnel (HTTPS,
 * WebSockets). Allowed ones connect to an address the guard returned for
 * that very request and to nothing else: the proxy never resolves a name
 * itself, so a second DNS answer cannot redirect it (DNS rebinding).
 * Connections idle for 30 s are closed, and one connection carries at most
 * 100 MB from the site.
 *
 * ```ts
 * const proxy = await startGuardProxy(checkUrl);
 * await chromium.launch({ proxy: { server: proxy.server, bypass: "<-loopback>" } });
 * proxy.blocked;      // the guard's errors, in order
 * await proxy.close();
 * ```
 */

import { createServer, request as httpRequest } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import type { Readable } from "node:stream";

/**
 * The URL guard: throws (e.g. `BlockedUrlError`) when a URL must not be
 * loaded, else returns the addresses its host may be reached at.
 */
export type CheckUrl = (url: string) => Promise<{ addresses: string[] }>;

const idleTimeoutMs = 30_000;
const maxBytesPerConnection = 100 * 1024 * 1024;

/** Headers that belong to one connection, not to the request. */
const hopByHop = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authorization", "te", "trailer", "upgrade"]);

const forwardable = (headers: IncomingHttpHeaders) =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => !hopByHop.has(name)));

/** Calls `onExceeded` once `stream` has carried more than the per-connection limit. */
function capBytes(stream: Readable, onExceeded: () => void) {
  let bytes = 0;
  stream.on("data", (chunk: Buffer) => {
    bytes += chunk.byteLength;
    if (bytes > maxBytesPerConnection) onExceeded();
  });
}

export async function startGuardProxy(checkUrl: CheckUrl) {
  const blocked: unknown[] = [];
  /** Everything still open: client tunnels and upstream connections. `close()` ends them. */
  const open = new Set<{ destroy: () => unknown }>();
  const track = (connection: { destroy: () => unknown; once: (event: "close", listener: () => void) => unknown }) => {
    open.add(connection);
    connection.once("close", () => open.delete(connection));
  };

  /** The address the guard allows for `url`, or null after recording why it refused. */
  async function admit(url: string): Promise<string | null> {
    try {
      const { addresses } = await checkUrl(url);
      return addresses[0] ?? null;
    } catch (error) {
      blocked.push(error);
      return null;
    }
  }

  // Plain HTTP: the request line carries the absolute URL.
  const server = createServer((request, response) => {
    void (async () => {
      const url = URL.parse(request.url ?? "");
      const address = url ? await admit(url.href) : null;
      if (!url || !address) return response.writeHead(403, { "content-type": "text/plain" }).end("Blocked by the capture worker.");
      if (response.destroyed) return;

      const upstream = httpRequest(
        {
          host: address,
          port: url.port || 80,
          method: request.method,
          path: `${url.pathname}${url.search}`,
          headers: forwardable(request.headers),
          timeout: idleTimeoutMs,
        },
        (answer) => {
          capBytes(answer, () => upstream.destroy());
          response.writeHead(answer.statusCode ?? 502, forwardable(answer.headers));
          answer.pipe(response);
        },
      );
      track(upstream);
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => response.destroy());
      // The browser gave up (or the page closed): stop fetching for it.
      response.on("close", () => upstream.destroy());
      request.pipe(upstream);
    })().catch(() => response.destroy());
  });
  server.setTimeout(idleTimeoutMs);

  // HTTPS and WebSockets: a tunnel to host:port; TLS stays end to end between Chromium and the site.
  server.on("connect", (request, socket, head) => {
    const client = request.socket;
    track(client);
    client.setTimeout(idleTimeoutMs, () => client.destroy());
    socket.on("error", () => client.destroy());
    void (async () => {
      const target = URL.parse(`https://${request.url ?? ""}/`);
      const address = target ? await admit(target.href) : null;
      if (!target || !address) return socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      if (client.destroyed) return;

      const upstream = connect({ host: address, port: Number(target.port || 443), timeout: idleTimeoutMs }, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      track(upstream);
      capBytes(upstream, () => upstream.destroy());
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      upstream.on("close", () => client.destroy());
      client.on("close", () => upstream.destroy());
    })().catch(() => client.destroy());
  });

  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;

  return {
    server: `http://127.0.0.1:${port}`,
    blocked,
    close: () =>
      new Promise<void>((closed) => {
        for (const connection of open) connection.destroy();
        server.closeAllConnections();
        server.close(() => closed());
      }),
  };
}
