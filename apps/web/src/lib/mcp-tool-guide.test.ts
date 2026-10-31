import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "@m3-inspo/mcp/server";
import { mcpToolGuide } from "./mcp-tool-guide";

describe("mcpToolGuide", () => {
  it("explains exactly the tools the MCP server registers", async () => {
    const server = createServer({
      catalogue: { screens: [], collections: [], referenceComponents: [], brandKits: [] },
      readAsset: async () => null,
      profile: "full",
    });
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await client.connect(clientSide);

    const { tools } = await client.listTools();

    expect(Object.keys(mcpToolGuide).sort()).toEqual(tools.map((tool) => tool.name).sort());
  });
});
