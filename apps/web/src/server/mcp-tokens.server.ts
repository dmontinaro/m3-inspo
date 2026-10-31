/**
 * MCP tokens: the bearer tokens coding agents send to /api/mcp.
 *
 * A token is `inspo_mcp_` plus 32 random bytes (base64url). The database
 * keeps only its SHA-256 hash and its first characters (to tell tokens
 * apart), with expiry, revocation and last use; the plaintext exists once,
 * in the answer to `createToken`. The owner manages tokens on the settings
 * page (mcp-tokens.functions.ts); the MCP route (routes/api/mcp.ts) checks
 * every request with `authenticateMcpRequest`.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@m3-inspo/db/client";
import { mcpCredentials } from "@m3-inspo/db/mcp-schema";
import type { TokenLifetimeDays } from "#/lib/mcp-tokens";

const tokenPrefix = "inspo_mcp_";
/** Characters kept in plain text to tell tokens apart: the fixed prefix plus six random ones. */
const shownPrefixLength = tokenPrefix.length + 6;
const dayMs = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** What the settings page may see of a token: everything but the hash. */
const listedColumns = {
  id: mcpCredentials.id,
  name: mcpCredentials.name,
  tokenPrefix: mcpCredentials.tokenPrefix,
  createdAt: mcpCredentials.createdAt,
  expiresAt: mcpCredentials.expiresAt,
  lastUsedAt: mcpCredentials.lastUsedAt,
  revokedAt: mcpCredentials.revokedAt,
};

/** Creates a token and returns its plaintext. This is the only time it exists outside the caller. */
export async function createToken(input: { name: string; expiresInDays: TokenLifetimeDays }) {
  const token = `${tokenPrefix}${randomBytes(32).toString("base64url")}`;
  const [credential] = await getDb()
    .insert(mcpCredentials)
    .values({
      name: input.name,
      tokenPrefix: token.slice(0, shownPrefixLength),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + input.expiresInDays * dayMs),
    })
    .returning(listedColumns);
  return { token, credential };
}

/** All tokens, newest first, including expired and revoked ones. */
export function listTokens() {
  return getDb().select(listedColumns).from(mcpCredentials).orderBy(desc(mcpCredentials.createdAt));
}

/** Revokes a token for good. Revoking twice keeps the first date. */
export async function revokeToken(id: string) {
  await getDb()
    .update(mcpCredentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpCredentials.id, id), isNull(mcpCredentials.revokedAt)));
}

/**
 * Whether the request carries a live token, as `Authorization: Bearer ...`
 * or as `x-api-key: ...` (for clients such as claude.ai that only send a
 * custom header): known, not revoked, not expired. Records the use as
 * `last_used_at`.
 *
 * The lookup goes by SHA-256 hash, so no constant-time comparison is
 * needed: timing can at most reveal how a guess's hash compares to stored
 * hashes, which says nothing about any token.
 */
export async function authenticateMcpRequest(headers: Headers): Promise<boolean> {
  const token = /^Bearer (\S+)$/i.exec(headers.get("authorization") ?? "")?.[1] ?? headers.get("x-api-key")?.trim();
  if (!token?.startsWith(tokenPrefix)) return false;

  const now = new Date();
  const used = await getDb()
    .update(mcpCredentials)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(mcpCredentials.tokenHash, hashToken(token)),
        isNull(mcpCredentials.revokedAt),
        gt(mcpCredentials.expiresAt, now),
      ),
    )
    .returning({ id: mcpCredentials.id });
  return used.length > 0;
}
