/** The MCP endpoint and token choices, shared by the settings page, the global gate and the server. */

/** Where coding agents reach the MCP server (routes/api/mcp.ts). */
export const mcpPath = "/api/mcp";

/**
 * Whether the router would send `pathname` to the MCP route. It matches
 * case-insensitively and ignores repeated and trailing slashes, so
 * `/API/MCP` and `/api/mcp//` count as well.
 */
export function isMcpPath(pathname: string): boolean {
  return pathname.toLowerCase().replace(/\/+/g, "/").replace(/\/$/, "") === mcpPath;
}

export const tokenLifetimeDays = [30, 90, 365] as const;
export type TokenLifetimeDays = (typeof tokenLifetimeDays)[number];
export const defaultTokenLifetimeDays: TokenLifetimeDays = 90;

export const maxTokenNameLength = 100;
