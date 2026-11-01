import { defaultSerovalDeserializerPlugins } from "@tanstack/react-router/ssr/server";
/**
 * Runs the real web app in-process for tests: Vite in test mode (no Nitro)
 * loads TanStack Start's server entry, and requests go straight to its
 * `fetch` handler. No port is opened.
 *
 * ```ts
 * const app = await startTestApp({ OWNER_GITHUB_ID: "1001" });
 * const browser = app.browser();
 * const response = await browser.get("/");
 * const getOwnerUrl = await app.serverFunctionUrl("/src/server/owner.functions.ts", "getOwner");
 * const owner = await callServerFunction<typeof getOwner>(browser, getOwnerUrl);
 * await app.close();
 * ```
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromCrossJSON, toJSON } from "seroval";
import { createServer, isRunnableDevEnvironment } from "vite";
import { inject } from "vitest";
// Types for `inject("databaseUrl")`, declared next to the setup that provides it.
import type {} from "@m3-inspo/db/test-setup";

type ServerEntry = { default: { fetch: (request: Request) => Promise<Response> } };

export const testOrigin = "http://localhost:3000";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Starts the app with a working test environment: the per-run test database,
 * fake GitHub OAuth credentials, a fresh storage folder that `close()`
 * removes, and no Anthropic, embeddings or Adobe Fonts key, so a key in the
 * shell never turns the AI analysis, the embeddings or the preview kit on. `env` adds to or overrides
 * these, e.g. `OWNER_GITHUB_ID`.
 */
export async function startTestApp(env: Record<string, string> = {}) {
  const storageDir = await mkdtemp(join(tmpdir(), "inspo-storage-"));
  Object.assign(process.env, {
    DATABASE_URL: inject("databaseUrl"),
    BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: testOrigin,
    GITHUB_CLIENT_ID: "test-client-id",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    STORAGE_DIR: storageDir,
    ANTHROPIC_API_KEY: "",
    EMBEDDINGS_API_KEY: "",
    EMBEDDINGS_BASE_URL: "",
    EMBEDDINGS_MODEL: "",
    ADOBE_FONTS_API_TOKEN: "",
    ...env,
  });

  const vite = await createServer({
    root: webRoot,
    configFile: `${webRoot}/vite.config.ts`,
    mode: "test",
    cacheDir: `${webRoot}/node_modules/.vite-test`,
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  const ssr = vite.environments.ssr;
  if (!isRunnableDevEnvironment(ssr)) throw new Error("SSR environment is not runnable in-process.");
  const entry = await ssr.runner.import<ServerEntry>("virtual:tanstack-start-server-entry");
  // The first request compiles the routes, several seconds with every test file starting at once.
  // Paid here, under the caller's setup timeout, instead of by whichever test asks first.
  await entry.default.fetch(new Request(new URL("/", testOrigin)));

  return {
    /** A client with its own cookie jar. Redirects are returned, not followed. */
    browser: () => createBrowser(entry.default.fetch),
    /**
     * Plain HTTP without cookies or browser headers, the way an MCP client
     * calls. Fits the MCP SDK's `fetch` option.
     */
    fetch: (url: string | URL, init?: RequestInit) => entry.default.fetch(new Request(new URL(url, testOrigin), init)),
    /**
     * The URL the browser bundle calls for a server function, read from the
     * client build of its module, so tests hit the real function ID.
     */
    serverFunctionUrl: async (file: string, exportName: string) => {
      const clientModule = await vite.environments.client.transformRequest(file);
      const id = clientModule?.code.match(
        new RegExp(`export const ${exportName} = [^;]*createClientRpc\\("([^"]+)"\\)`),
      )?.[1];
      if (!id) throw new Error(`No server function ${exportName} in ${file}.`);
      return `/_serverFn/${id}`;
    },
    close: async () => {
      await vite.close();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
export type TestBrowser = ReturnType<typeof createBrowser>;

function createBrowser(fetchApp: ServerEntry["default"]["fetch"]) {
  const cookies = new Map<string, string>();

  async function send(path: string, init: RequestInit = {}) {
    // What a same-origin browser request carries; CSRF checks look at these.
    // Headers passed in `init` win, e.g. to act as a cross-site request.
    const headers = new Headers({ origin: testOrigin, "sec-fetch-site": "same-origin" });
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }

    const response = await fetchApp(new Request(new URL(path, testOrigin), { ...init, headers }));
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "" || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  }

  return {
    send,
    setCookie: (name: string, value: string) => { cookies.set(name, value); },
    get: (path: string, headers?: HeadersInit) => send(path, { headers }),
    post: (path: string, body?: unknown, headers?: HeadersInit) =>
      send(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

type ServerFunction = (...args: never[]) => Promise<unknown>;

/** Sends a server function request in the browser bundle's wire format (see `callServerFunction`). */
async function sendServerFunction(browser: TestBrowser, url: string, data: unknown, method: "GET" | "POST") {
  const headers = { "x-tsr-serverFn": "true" };
  if (data instanceof FormData) return browser.send(url, { method: "POST", headers, body: data });

  const payload = JSON.stringify(toJSON({ data }));
  if (method === "POST") {
    return browser.send(url, { method, headers: { ...headers, "content-type": "application/json" }, body: payload });
  }
  if (data === undefined) return browser.send(url, { headers });
  return browser.send(`${url}?${new URLSearchParams({ payload })}`, { headers });
}

/**
 * Calls a server function the way the browser bundle does and returns its
 * decoded result: FormData goes as a multipart POST, other data as a GET
 * payload, or as a JSON body when `method` is "POST" (functions created with
 * `{ method: "POST" }`). Throws if the function threw or the request was
 * turned away. Pass the function's type (`typeof getOwner`) to type the result.
 */
export async function callServerFunction<TFunction extends ServerFunction>(
  browser: TestBrowser,
  url: string,
  data?: unknown,
  method: "GET" | "POST" = "GET",
): Promise<Awaited<ReturnType<TFunction>>> {
  const response = await sendServerFunction(browser, url, data, method);
  if (!response.headers.has("x-tss-serialized")) {
    throw new Error(`Server function answered ${response.status}: ${await response.text()}`);
  }

  // Start's wire format: a seroval payload shaped `{ result }` or `{ error }`.
  const payload = fromCrossJSON<{ result?: Awaited<ReturnType<TFunction>>; error?: unknown }>(await response.json(), {
    refs: new Map(),
    plugins: defaultSerovalDeserializerPlugins,
  });
  if (payload.error !== undefined) throw payload.error;
  return payload.result as Awaited<ReturnType<TFunction>>;
}
