/**
 * MCP access: the bearer tokens coding agents use for /api/mcp (docs/spec.md,
 * MCP-Zugang). Only a token's SHA-256 hash is stored; the plaintext is shown
 * to the owner once, when the token is created.
 */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const mcpCredentials = pgTable("mcp_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The owner's label, e.g. "Claude Code Laptop". */
  name: text("name").notNull(),
  /** The token's first characters, so the owner can tell tokens apart. Not secret. */
  tokenPrefix: text("token_prefix").notNull(),
  /** SHA-256 (hex) of the full token. */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
