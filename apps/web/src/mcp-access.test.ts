/**
 * The MCP endpoint as a coding agent sees it: a real MCP client talks HTTP to
 * the in-process app with a bearer token the owner created in the settings.
 */

import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb } from "@m3-inspo/db/client";
import { mcpCredentials } from "@m3-inspo/db/mcp-schema";
import { callServerFunction, startTestApp, testOrigin } from "./test/app";
import { signInWithGithub, useFakeGithub } from "./test/fake-github";
import { callTool, connectMcp, createMcpToken, uploadScreenshot } from "./test/library";
import type { TestApp, TestBrowser } from "./test/app";
import type { GithubAccount } from "./test/fake-github";
import type { listMcpTokens, revokeMcpToken } from "./server/mcp-tokens.functions";

// Each test file signs in its own owner: files run in parallel on one database,
// and two first sign-ins with the same email would race on the unique email.
const owner: GithubAccount = { id: 5005, login: "mcp-owner", name: "Alex", email: "mcp-owner@example.com" };
const deployCommit = "4f3c2b1a9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b";

let app: TestApp;
let browser: TestBrowser;

beforeAll(async () => {
  useFakeGithub([owner]);
  app = await startTestApp({
    OWNER_GITHUB_ID: String(owner.id),
    INSPO_BASE_URL: testOrigin,
    RAILWAY_GIT_COMMIT_SHA: deployCommit,
    // No embedding provider in tests; search stays lexical.
    EMBEDDINGS_API_KEY: "",
  });
  browser = app.browser();
  await signInWithGithub(browser, owner);
}, 60_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const tokensFile = "/src/server/mcp-tokens.functions.ts";

const createToken = (name?: string) => createMcpToken(app, browser, name);

async function revokeToken(id: string) {
  const url = await app.serverFunctionUrl(tokensFile, "revokeMcpToken");
  await callServerFunction<typeof revokeMcpToken>(browser, url, { id }, "POST");
}

async function listTokens() {
  return callServerFunction<typeof listMcpTokens>(browser, await app.serverFunctionUrl(tokensFile, "listMcpTokens"));
}

async function lastUsedAt(id: string) {
  return (await listTokens()).find((row) => row.id === id)?.lastUsedAt;
}

const toolList = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) });

/** A bare JSON-RPC `tools/list` over HTTP, optionally with extra headers such as a bearer token. */
function listToolsRequest(headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  };
}

describe("access to /api/mcp", () => {
  it("lists the tools for a valid token", async () => {
    const { token } = await createToken();

    const response = await app.fetch("/api/mcp", listToolsRequest({ authorization: `Bearer ${token}` }));

    expect(response.status).toBe(200);
    // The full tool list is pinned by the contract test in packages/mcp.
    expect(toolList.parse(await response.json()).result.tools.map((tool) => tool.name)).toContain("get_screen");
  });

  // claude.ai connectors can only send a custom header, not `Authorization: Bearer`.
  it("accepts the token as x-api-key", async () => {
    const { token } = await createToken();

    expect((await app.fetch("/api/mcp", listToolsRequest({ "x-api-key": token }))).status).toBe(200);
    expect((await app.fetch("/api/mcp", listToolsRequest({ "x-api-key": `${token.slice(0, -4)}AAAA` }))).status).toBe(
      401,
    );
  });

  it("answers 401 without a token, even with the owner's session", async () => {
    expect((await app.fetch("/api/mcp", listToolsRequest())).status).toBe(401);
    expect((await browser.send("/api/mcp", listToolsRequest())).status).toBe(401);
  });

  // The router matches paths case-insensitively and ignores trailing slashes.
  const pathVariants = ["/api/mcp/", "/api/mcp//", "/API/MCP", "/api/Mcp"];

  it("answers 401 to the owner's session without a token on every path variant", async () => {
    for (const path of pathVariants) {
      expect((await browser.send(path, listToolsRequest())).status, path).toBe(401);
    }
  });

  it("serves every path variant with a valid token", async () => {
    const { token } = await createToken();

    for (const path of pathVariants) {
      expect((await app.fetch(path, listToolsRequest({ authorization: `Bearer ${token}` }))).status, path).toBe(200);
    }
  });

  it("answers 401 for a wrong token", async () => {
    const { token } = await createToken();
    const wrong = `${token.slice(0, -4)}AAAA`;

    const response = await app.fetch("/api/mcp", listToolsRequest({ authorization: `Bearer ${wrong}` }));

    expect(response.status).toBe(401);
  });

  it("answers 401 for an expired token", async () => {
    const { token, id } = await createToken();
    await getDb()
      .update(mcpCredentials)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(mcpCredentials.id, id));

    const response = await app.fetch("/api/mcp", listToolsRequest({ authorization: `Bearer ${token}` }));

    expect(response.status).toBe(401);
  });

  it("answers 401 for a revoked token", async () => {
    const { token, id } = await createToken();
    await revokeToken(id);

    const response = await app.fetch("/api/mcp", listToolsRequest({ authorization: `Bearer ${token}` }));

    expect(response.status).toBe(401);
  });
});

describe("tokens in the settings", () => {
  it("show when a token was last used, updated on every use", async () => {
    const { token, id } = await createToken("Zuletzt genutzt");
    expect(await lastUsedAt(id)).toBeNull();

    await connectMcp(app, token);
    const firstUse = await lastUsedAt(id);
    expect(firstUse).toBeInstanceOf(Date);

    await sleep(20);
    await connectMcp(app, token);
    expect((await lastUsedAt(id))?.getTime()).toBeGreaterThan(firstUse?.getTime() ?? Infinity);
  });

  it("store only the SHA-256 hash, never the token itself", async () => {
    const { token, id } = await createToken("Nur Hash");

    const rows = await getDb().select().from(mcpCredentials);

    expect(rows.find((row) => row.id === id)?.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(rows)).not.toContain(token.slice(16));
  });
});

describe("the catalogue behind the tools", () => {
  it("returns an uploaded reference with the owner's notes in `taste` and its image", async () => {
    const slug = await uploadScreenshot(app, browser, "Hotel Seeblick Startseite", {
      takeNote: "Typografie ja",
      avoidNote: "Farben nein",
    });
    const client = await connectMcp(app, (await createToken()).token);

    const { json, images } = await callTool(client, "get_screen", { slug });

    expect(json).toMatchObject({
      slug,
      title: "Hotel Seeblick Startseite",
      taste: { take: "Typografie ja", avoid: "Farben nein", focus: null, isFavorite: false },
      thumb: expect.stringMatching(new RegExp(`^${testOrigin}/api/assets/references/.+/thumb\\.webp$`)),
      // Nothing analysed yet: design values stay empty instead of guessed.
      palette: [],
      fonts: [],
    });
    // No page was read, so there is nothing whose provenance could be stated.
    expect(json).not.toHaveProperty("provenance");
    const image = images.at(0);
    expect(image?.mimeType).toBe("image/webp");
    const { format, width } = await sharp(Buffer.from(image?.data ?? "", "base64")).metadata();
    expect({ format, width }).toEqual({ format: "webp", width: 960 });
  });

  it("names the deploy commit as server version", async () => {
    const client = await connectMcp(app, (await createToken()).token);

    expect(client.getServerVersion()).toMatchObject({ name: "m3-inspo", version: "m3-inspo-4f3c2b1" });
  });
});
