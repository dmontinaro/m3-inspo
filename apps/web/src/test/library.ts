/**
 * Library and MCP steps shared by the test files: upload a screenshot the way
 * the upload page does, create an MCP token in the settings and talk to
 * /api/mcp as a coding agent would.
 *
 * ```ts
 * const slug = await uploadScreenshot(app, browser, "Hotel Seeblick", { takeNote: "Typografie ja", tags: ["hotel"] });
 * const agent = await connectMcp(app, (await createMcpToken(app, browser)).token);
 * const { json, images } = await callTool(agent, "get_screen", { slug });
 * ```
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import sharp from "sharp";
import { z } from "zod";
import { callServerFunction, testOrigin } from "./app";
import type { TestApp, TestBrowser } from "./app";
import type { uploadImage } from "../server/library.functions";
import type { createMcpToken as createMcpTokenFunction } from "../server/mcp-tokens.functions";

/**
 * The upload sheet's optional fields; `tags` go as one form entry each, like
 * the chips. `png` replaces the plain 1440 × 900 screenshot.
 */
type UploadFields = { takeNote?: string; avoidNote?: string; sourceUrl?: string; tags?: string[]; png?: Buffer<ArrayBuffer> };

/**
 * Uploads a small screenshot with the upload sheet's fields and returns the
 * new reference's slug. Throws the German reason if the upload is rejected.
 */
export async function uploadScreenshot(app: TestApp, browser: TestBrowser, title: string, fields: UploadFields = {}) {
  const png =
    fields.png ??
    (await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#f4efe6" } })
      .png()
      .toBuffer());
  const form = new FormData();
  form.set("file", new Blob([png], { type: "image/png" }), "screenshot.png");
  form.set("title", title);
  form.set("takeNote", fields.takeNote ?? "");
  form.set("avoidNote", fields.avoidNote ?? "");
  form.set("sourceUrl", fields.sourceUrl ?? "");
  for (const tag of fields.tags ?? []) form.append("tags", tag);
  const url = await app.serverFunctionUrl("/src/server/library.functions.ts", "uploadImage");
  const result = await callServerFunction<typeof uploadImage>(browser, url, form);
  if (!result.ok) throw new Error(result.reason);
  return result.slug;
}

/** Creates a token with the settings form and returns its one-time plaintext and id. */
export async function createMcpToken(app: TestApp, browser: TestBrowser, name = "Claude Code") {
  const form = new FormData();
  form.set("name", name);
  form.set("expiresInDays", "90");
  const url = await app.serverFunctionUrl("/src/server/mcp-tokens.functions.ts", "createMcpToken");
  const created = await callServerFunction<typeof createMcpTokenFunction>(browser, url, form);
  return { token: created.token, id: created.credential.id };
}

/** An MCP client connected to the app's /api/mcp with a bearer token. */
export async function connectMcp(app: TestApp, token: string) {
  const client = new Client({ name: "vitest", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", testOrigin), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: app.fetch,
  });
  await client.connect(transport);
  return client;
}

const toolJson = z.record(z.string(), z.unknown());

/** Calls one tool and returns its first text block parsed as a JSON object, plus its image blocks. */
export async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const { content } = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const text = content.find((block) => block.type === "text");
  const images = content.filter((block) => block.type === "image");
  return { json: toolJson.parse(JSON.parse(text?.text ?? "null")), images };
}
