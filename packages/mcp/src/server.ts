/**
 * The MCP server factory. The caller hands in the catalogue the tools
 * read, the function that loads its images and, optionally, the reader for
 * live source pages; the server holds no other data. Build one per request
 * so catalogue changes show up immediately.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, SERVER_INSTRUCTIONS, type ToolDeps } from "./tools";
import type { RegisterOptions } from "./profile";
import { SERVER_VERSION } from "./version";

export type { ToolDeps } from "./tools";
export type { Asset, ReadAsset } from "./inline-images";
export { fetchAsset } from "./inline-images";

export type CreateServerOptions = ToolDeps & RegisterOptions;

/** An MCP server with all tools registered over `catalogue`; connect it
 *  to any transport. */
export function createServer({
  catalogue,
  readAsset,
  studySource,
  ...opts
}: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: "m3-inspo", version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerTools(server, { catalogue, readAsset, studySource }, opts);
  return server;
}
