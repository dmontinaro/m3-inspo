import { createFileRoute } from "@tanstack/react-router";
import { assetsPath, loadCatalogue } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import { handleMcpRequest } from "@m3-inspo/mcp/http";
import type { ReadAsset } from "@m3-inspo/mcp/server";
import { study } from "@m3-inspo/shared";
import { fetchPublicText } from "@m3-inspo/shared/public-fetch";
import { authenticateMcpRequest } from "#/server/mcp-tokens.server";
import { getStorage, isValidKey } from "#/server/storage.server";

/**
 * Reads a catalogue image reference (`/api/assets/<storage key>`) straight
 * from storage, so tool results carry the image inline without an HTTP hop.
 */
const readStoredAsset: ReadAsset = async (ref) => {
  const key = ref.startsWith(assetsPath) ? ref.slice(assetsPath.length) : "";
  const object = isValidKey(key) ? await getStorage().read(key) : null;
  if (!object) return null;
  return { data: new Uint8Array(await new Response(object.body).arrayBuffer()), mimeType: object.contentType };
};

/**
 * One stateless MCP exchange over a catalogue loaded for this request, only
 * with a live token (bearer or `x-api-key`). The session cookie never counts
 * here, so the endpoint needs no CSRF check: browsers add neither header on
 * their own. The 401 is the same for a missing, unknown, expired or
 * revoked token.
 */
async function serveMcp({ request }: { request: Request }) {
  if (!(await authenticateMcpRequest(request.headers))) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="inspo"' } });
  }
  return handleMcpRequest(request, {
    catalogue: await loadCatalogue(getDb()),
    readAsset: readStoredAsset,
    studySource: readSourcePage,
  });
}

/**
 * `get_design_system` with `live: true`: reads a reference's own source page
 * and its stylesheets, every URL and redirect through the URL guard, with a
 * timeout and size cap per request (@m3-inspo/shared/public-fetch).
 */
const readSourcePage = (url: string) => study(url, fetchPublicText);

/**
 * The MCP endpoint for coding agents (Streamable HTTP). The global gate in
 * src/start.ts leaves every path the router matches here to this token check.
 */
export const Route = createFileRoute("/api/mcp")({
  server: { handlers: { POST: serveMcp, GET: serveMcp, DELETE: serveMcp } },
});
